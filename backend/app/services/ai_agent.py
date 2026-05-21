"""
SeuFluxo WhatsApp — Agente IA Autônomo
Orquestrador LangGraph com Groq LLM + Tools nativas do sistema.

Fluxo:
  mensagem recebida
       ↓
  carregar contexto (histórico + RAG knowledge)
       ↓
  LLM decide → chamar tool OU responder
       ↓
  tool executa (enviar msg, mover kanban, adicionar tag, escalar humano)
       ↓
  salvar resposta no banco
"""

import logging
import json
from typing import Annotated, TypedDict, Literal
from datetime import datetime

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from app.database import get_supabase
from app.config import get_settings

logger = logging.getLogger("seufluxo.ai_agent")

# ──────────────────────────────────────────────────────────────────────────────
# STATE — O estado que circula pelo grafo LangGraph
# ──────────────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    contact_id: str
    company_id: str
    phone: str
    instance_name: str
    evolution_apikey: str
    contact: dict
    stage: dict
    # Resultado da execução
    response_sent: bool
    escalated: bool


# ──────────────────────────────────────────────────────────────────────────────
# TOOLS — Ações que o LLM pode executar
# ──────────────────────────────────────────────────────────────────────────────

def make_tools(state_holder: dict):
    """
    Cria as tools injetando o contexto (contact_id, company_id, etc.)
    via closure, sem precisar passar state pela API do LangChain.
    """

    @tool
    def send_text_message(text: str) -> str:
        """
        Envia uma mensagem de texto para o cliente via WhatsApp.
        Use para responder perguntas, enviar informações ou continuar a conversa.
        Não use markdown — o WhatsApp usa *negrito*, _itálico_, ~tachado~.
        """
        import asyncio
        from app.services.evolution import EvolutionAPI

        db = get_supabase()
        contact_id = state_holder["contact_id"]
        company_id = state_holder["company_id"]
        phone = state_holder["phone"]
        instance = state_holder["instance_name"]
        apikey = state_holder["evolution_apikey"]

        try:
            evo = EvolutionAPI(instance, apikey)
            # Rodar chamada async em contexto sync
            loop = asyncio.new_event_loop()
            loop.run_until_complete(evo.send_presence(phone, composing=True))
            import time; time.sleep(1)  # simular digitação
            loop.run_until_complete(evo.send_text(phone, text))
            loop.close()

            # Salvar no banco
            db.table("messages").insert({
                "company_id": company_id,
                "contact_id": contact_id,
                "direction": "out",
                "content": text,
            }).execute()

            db.table("contacts").update({
                "last_message": "now()",
                "last_message_content": text[:200]
            }).eq("id", contact_id).execute()

            logger.info(f"[AI Agent] Mensagem enviada → {phone}: {text[:60]}")
            return "Mensagem enviada com sucesso."
        except Exception as e:
            logger.error(f"[AI Agent] Erro ao enviar mensagem: {e}")
            return f"Erro ao enviar mensagem: {e}"

    @tool
    def escalate_to_human(reason: str) -> str:
        """
        Transfere o atendimento para um humano.
        Use quando: o lead quer falar com um humano, há reclamação grave,
        pergunta muito específica que a IA não consegue responder,
        ou o lead demonstra frustração.
        Parâmetro reason: breve explicação do motivo da escalada.
        """
        db = get_supabase()
        contact_id = state_holder["contact_id"]
        company_id = state_holder["company_id"]

        try:
            db.table("contacts").update({
                "chat_status": "human"
            }).eq("id", contact_id).execute()

            state_holder["escalated"] = True
            logger.info(f"[AI Agent] Escalado para humano. Motivo: {reason}")
            return f"Atendimento transferido para humano. Motivo registrado: {reason}"
        except Exception as e:
            return f"Erro ao escalar: {e}"

    @tool
    def move_to_kanban_stage(stage_name: str) -> str:
        """
        Move o lead para um estágio específico do Kanban.
        Use quando o lead demonstrar interesse em um produto/serviço específico,
        ou quando avançar na jornada de vendas.
        Parâmetro stage_name: nome EXATO do estágio (case-insensitive).
        """
        db = get_supabase()
        contact_id = state_holder["contact_id"]
        company_id = state_holder["company_id"]

        try:
            # Buscar o stage pelo nome
            res = (
                db.table("kanban_stages")
                .select("id, name")
                .eq("company_id", company_id)
                .ilike("name", stage_name)
                .limit(1)
                .execute()
            )
            if not res.data:
                # Tentar busca parcial
                all_stages = db.table("kanban_stages").select("id, name").eq("company_id", company_id).execute()
                if all_stages.data:
                    stage_list = ", ".join(s["name"] for s in all_stages.data)
                    return f"Estágio '{stage_name}' não encontrado. Estágios disponíveis: {stage_list}"
                return f"Estágio '{stage_name}' não encontrado."

            stage = res.data[0]
            db.table("contacts").update({"stage_id": stage["id"]}).eq("id", contact_id).execute()
            state_holder["contact"]["stage_id"] = stage["id"]

            logger.info(f"[AI Agent] Lead movido para estágio '{stage['name']}'")
            return f"Lead movido para o estágio '{stage['name']}' com sucesso."
        except Exception as e:
            return f"Erro ao mover estágio: {e}"

    @tool
    def add_tag_to_contact(tag_name: str) -> str:
        """
        Adiciona uma tag ao lead para segmentação e organização.
        Use quando identificar interesse, perfil ou comportamento relevante.
        Parâmetro tag_name: nome EXATO da tag (case-insensitive).
        """
        db = get_supabase()
        contact_id = state_holder["contact_id"]
        company_id = state_holder["company_id"]

        try:
            # Buscar tag pelo nome
            res = (
                db.table("tags")
                .select("id, name")
                .eq("company_id", company_id)
                .ilike("name", tag_name)
                .limit(1)
                .execute()
            )
            if not res.data:
                all_tags = db.table("tags").select("name").eq("company_id", company_id).execute()
                tag_list = ", ".join(t["name"] for t in (all_tags.data or []))
                return f"Tag '{tag_name}' não encontrada. Tags disponíveis: {tag_list or 'Nenhuma'}"

            tag = res.data[0]
            # Verificar duplicata
            existing = (
                db.table("contact_tags")
                .select("id")
                .eq("contact_id", contact_id)
                .eq("tag_id", tag["id"])
                .execute()
            )
            if existing.data:
                return f"Tag '{tag['name']}' já estava no contato."

            db.table("contact_tags").insert({
                "contact_id": contact_id,
                "tag_id": tag["id"]
            }).execute()

            logger.info(f"[AI Agent] Tag '{tag['name']}' adicionada ao lead")
            return f"Tag '{tag['name']}' adicionada com sucesso."
        except Exception as e:
            return f"Erro ao adicionar tag: {e}"

    @tool
    def update_contact_notes(notes: str) -> str:
        """
        Atualiza as anotações internas do lead no CRM.
        Use para registrar informações importantes capturadas na conversa:
        preferências, objetivos, objeções, próximos passos.
        Parâmetro notes: texto com as anotações (será SUBSTITUÍDO, não concatenado).
        """
        db = get_supabase()
        contact_id = state_holder["contact_id"]

        try:
            db.table("contacts").update({"notes": notes}).eq("id", contact_id).execute()
            logger.info(f"[AI Agent] Notas do contato atualizadas")
            return "Notas do CRM atualizadas com sucesso."
        except Exception as e:
            return f"Erro ao atualizar notas: {e}"

    return [
        send_text_message,
        escalate_to_human,
        move_to_kanban_stage,
        add_tag_to_contact,
        update_contact_notes,
    ]


# ──────────────────────────────────────────────────────────────────────────────
# CONTEXT BUILDER — Monta o contexto de conversa e base de conhecimento
# ──────────────────────────────────────────────────────────────────────────────

def build_context(contact_id: str, company_id: str, stage: dict) -> dict:
    """
    Busca:
    1. Últimas 20 mensagens da conversa
    2. Base de conhecimento da empresa (RAG — primeiros 10 itens)
    3. Contexto AI anterior (sumário)
    4. Tags e informações do contato
    """
    db = get_supabase()

    # 1. Histórico de mensagens (últimas 20)
    msgs_res = (
        db.table("messages")
        .select("direction, content, created_at, transcribed_text")
        .eq("contact_id", contact_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    history = list(reversed(msgs_res.data or []))

    # 2. Base de conhecimento (sem RAG vetorial por ora, busca simples dos 10 primeiros)
    knowledge_res = (
        db.table("company_knowledge")
        .select("title, content")
        .eq("company_id", company_id)
        .limit(10)
        .execute()
    )
    knowledge = knowledge_res.data or []

    # 3. Contexto AI anterior
    ctx_res = (
        db.table("contact_ai_context")
        .select("last_human_summary")
        .eq("contact_id", contact_id)
        .execute()
    )
    ai_context = ctx_res.data[0].get("last_human_summary", "") if ctx_res.data else ""

    return {
        "history": history,
        "knowledge": knowledge,
        "ai_context": ai_context,
    }


def build_system_prompt(contact: dict, stage: dict, context: dict) -> str:
    """Monta o system prompt completo para o LLM."""

    contact_name = contact.get("name") or "Cliente"
    contact_phone = contact.get("phone", "")
    contact_notes = contact.get("notes") or ""
    stage_name = stage.get("name", "")
    ai_instructions = stage.get("ai_instructions") or ""

    # Base de conhecimento formatada
    knowledge_text = ""
    if context["knowledge"]:
        knowledge_text = "\n\n## BASE DE CONHECIMENTO DA EMPRESA:\n"
        for item in context["knowledge"]:
            knowledge_text += f"\n### {item['title']}\n{item['content']}\n"

    # Contexto anterior
    previous_context = ""
    if context["ai_context"]:
        previous_context = f"\n\n## HISTÓRICO DE CONTEXTO:\n{context['ai_context']}"

    # Instruções específicas do estágio
    stage_instructions = ""
    if ai_instructions:
        stage_instructions = f"\n\n## INSTRUÇÕES PARA ESTE ESTÁGIO ({stage_name}):\n{ai_instructions}"

    return f"""Você é um assistente de vendas e atendimento da empresa, operando via WhatsApp.
Você representa a empresa e atende o cliente de forma profissional, empática e eficiente.

## LEAD ATUAL:
- Nome: {contact_name}
- Telefone: {contact_phone}
- Estágio no funil: {stage_name}
- Notas do CRM: {contact_notes or "Sem notas"}

## REGRAS GERAIS:
1. Seja conciso — mensagens longas no WhatsApp são ignoradas. Prefira 2-4 parágrafos curtos.
2. Use linguagem natural e conversacional, não robótica.
3. NÃO use markdown com # ou ** — use *negrito* e _itálico_ do WhatsApp.
4. Responda apenas ao que foi perguntado. Não antecipe demais.
5. Se não souber algo, diga que vai verificar e escale para humano.
6. Sempre que identificar interesse concreto de compra, mova para o estágio adequado.
7. Registre nas notas do CRM qualquer informação relevante capturada.
{stage_instructions}{knowledge_text}{previous_context}

Data/hora atual: {datetime.now().strftime('%d/%m/%Y %H:%M')}
"""


# ──────────────────────────────────────────────────────────────────────────────
# NODOS DO GRAFO LangGraph
# ──────────────────────────────────────────────────────────────────────────────

def agent_node(state: AgentState, llm_with_tools):
    """Nó principal: chama o LLM com o contexto e ferramentas disponíveis."""
    messages = state["messages"]
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def tool_node(state: AgentState, tools_by_name: dict):
    """Executa as tool calls que o LLM solicitou."""
    last_message = state["messages"][-1]
    results = []

    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]

        if tool_name in tools_by_name:
            try:
                result = tools_by_name[tool_name].invoke(tool_args)
            except Exception as e:
                result = f"Erro na tool {tool_name}: {e}"
        else:
            result = f"Tool '{tool_name}' não encontrada."

        results.append(ToolMessage(
            content=str(result),
            tool_call_id=tool_call["id"]
        ))

    return {"messages": results}


def should_continue(state: AgentState) -> Literal["tools", "end"]:
    """Decide se continua executando tools ou finaliza."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "end"


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — Função principal chamada pelo webhook
# ──────────────────────────────────────────────────────────────────────────────

async def run_ai_agent(
    contact_id: str,
    company_id: str,
    phone: str,
    instance_name: str,
    evolution_apikey: str,
    contact: dict,
    stage: dict,
    incoming_message: str,
):
    """
    Ponto de entrada do agente IA.
    Chamado pelo webhook quando o estágio do lead tem is_ai_managed=True.
    Suporta Groq (padrão, gratuito) e OpenAI (GPT) via AI_PROVIDER no .env.
    """
    settings = get_settings()
    provider = (getattr(settings, "ai_provider", "groq") or "groq").lower()
    groq_api_key = getattr(settings, "groq_api_key", "")
    openai_api_key = getattr(settings, "openai_api_key", "")
    custom_model = getattr(settings, "ai_model", "") or ""

    # ── 1. Instanciar LLM conforme provedor ──
    if provider == "openai":
        if not openai_api_key:
            logger.error("[AI Agent] OPENAI_API_KEY não configurada. Configure AI_PROVIDER=groq ou adicione a chave.")
            return
        from langchain_openai import ChatOpenAI
        model_name = custom_model or "gpt-4o-mini"
        llm_base = ChatOpenAI(model=model_name, api_key=openai_api_key, temperature=0.4, max_tokens=1024)
        logger.info(f"[AI Agent] Iniciando via OpenAI ({model_name}) para {phone} | msg: {incoming_message[:60]}")

    elif provider == "deepseek":
        deepseek_api_key = getattr(settings, "deepseek_api_key", "")
        if not deepseek_api_key:
            logger.error("[AI Agent] DEEPSEEK_API_KEY não configurada. Configure AI_PROVIDER=groq ou adicione a chave.")
            return
        from langchain_openai import ChatOpenAI
        model_name = custom_model or "deepseek-chat"
        llm_base = ChatOpenAI(
            model=model_name,
            api_key=deepseek_api_key,
            base_url="https://api.deepseek.com/v1",
            temperature=0.4,
            max_tokens=1024,
        )
        logger.info(f"[AI Agent] Iniciando via DeepSeek ({model_name}) para {phone} | msg: {incoming_message[:60]}")

    else:  # groq (padrão)
        if not groq_api_key:
            logger.error("[AI Agent] GROQ_API_KEY não configurada. Configure AI_PROVIDER=openai ou adicione a chave.")
            return
        model_name = custom_model or "llama-3.3-70b-versatile"
        llm_base = ChatGroq(model=model_name, api_key=groq_api_key, temperature=0.4, max_tokens=1024)
        logger.info(f"[AI Agent] Iniciando via Groq ({model_name}) para {phone} | msg: {incoming_message[:60]}")

    # ── 2. Construir contexto ──
    context = build_context(contact_id, company_id, stage)
    system_prompt = build_system_prompt(contact, stage, context)

    # ── 3. Montar histórico de mensagens para o LLM ──
    lc_messages = [SystemMessage(content=system_prompt)]

    for msg in context["history"][:-1]:  # Exclui a última (será adicionada como HumanMessage abaixo)
        text = msg.get("transcribed_text") or msg.get("content") or ""
        if not text:
            continue
        if msg["direction"] == "in":
            lc_messages.append(HumanMessage(content=text))
        else:
            lc_messages.append(AIMessage(content=text))

    # Adicionar mensagem atual do lead
    lc_messages.append(HumanMessage(content=incoming_message))

    # ── 4. Criar tools com contexto injetado ──
    state_holder = {
        "contact_id": contact_id,
        "company_id": company_id,
        "phone": phone,
        "instance_name": instance_name,
        "evolution_apikey": evolution_apikey,
        "contact": contact,
        "escalated": False,
        "response_sent": False,
    }
    tools = make_tools(state_holder)
    tools_by_name = {t.name: t for t in tools}
    llm_with_tools = llm_base.bind_tools(tools)

    # ── 5. Construir grafo LangGraph ──
    def _agent(state): return agent_node(state, llm_with_tools)
    def _tools(state): return tool_node(state, tools_by_name)

    graph = StateGraph(AgentState)
    graph.add_node("agent", _agent)
    graph.add_node("tools", _tools)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
    graph.add_edge("tools", "agent")
    compiled = graph.compile()

    # ── 6. Executar o grafo ──
    initial_state = AgentState(
        messages=lc_messages,
        contact_id=contact_id,
        company_id=company_id,
        phone=phone,
        instance_name=instance_name,
        evolution_apikey=evolution_apikey,
        contact=contact,
        stage=stage,
        response_sent=False,
        escalated=False,
    )

    try:
        await compiled.ainvoke(initial_state)
        logger.info(
            f"[AI Agent] Concluído para {phone}. "
            f"Provedor: {provider} | Escalado: {state_holder.get('escalated', False)}"
        )
    except Exception as e:
        logger.error(f"[AI Agent] Erro durante execução do grafo: {e}", exc_info=True)

