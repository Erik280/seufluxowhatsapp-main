import asyncio
import os
import sys

# Adiciona o diretório app ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_supabase

def fix_stuck_flows():
    print("Iniciando correção de contatos travados...")
    db = get_supabase()
    
    # Busca contatos que têm flow_alert mas o fluxo não foi finalizado
    result = db.table("contacts").select("id, name, phone").eq("flow_alert", True).not_.is_("flow_current_flow_id", "null").execute()
    
    contacts = result.data or []
    if not contacts:
        print("Nenhum contato travado encontrado.")
        return
        
    print(f"Encontrados {len(contacts)} contatos precisando de correção.")
    
    for c in contacts:
        try:
            db.table("contacts").update({
                "flow_current_flow_id": None,
                "flow_current_step_index": None
            }).eq("id", c["id"]).execute()
            print(f"✅ Contato corrigido: {c.get('name') or c.get('phone')} (ID: {c['id']})")
        except Exception as e:
            print(f"❌ Erro ao corrigir contato {c['id']}: {e}")
            
    print("Finalizado!")

if __name__ == "__main__":
    fix_stuck_flows()
