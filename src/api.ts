/**
 * SeuFluxo WhatsApp — API Client
 * Funções para comunicação com o backend FastAPI.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `API Error: ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}


// ========================
// Health
// ========================

export const checkHealth = () =>
  apiRequest<{ status: string; version: string }>('/api/health');


// ========================
// Contacts
// ========================

export const getContacts = (companyId: string) =>
  apiRequest(`/api/contacts/${companyId}`);

export const updateContactStatus = (contactId: string, chatStatus: 'bot' | 'human') =>
  apiRequest(`/api/contacts/${contactId}/status`, {
    method: 'PATCH',
    body: { chat_status: chatStatus },
  });


// ========================
// Flows
// ========================

export const getFlows = (companyId: string) =>
  apiRequest(`/api/flows/${companyId}`);

export const createFlow = (data: { company_id: string; name: string; trigger_keyword: string }) =>
  apiRequest('/api/flows', { method: 'POST', body: data });

export const toggleFlow = (flowId: string) =>
  apiRequest(`/api/flows/${flowId}/toggle`, { method: 'PATCH' });

export const deleteFlow = (flowId: string) =>
  apiRequest(`/api/flows/${flowId}`, { method: 'DELETE' });


// ========================
// Flow Steps
// ========================

export const getFlowSteps = (flowId: string) =>
  apiRequest(`/api/flows/${flowId}/steps`);

export const createStep = (data: {
  flow_id: string;
  type: 'text' | 'audio' | 'image';
  content: string;
  delay_duration: number;
  order_index: number;
}) =>
  apiRequest('/api/flows/steps', { method: 'POST', body: data });

export const deleteStep = (stepId: string) =>
  apiRequest(`/api/flows/steps/${stepId}`, { method: 'DELETE' });


// ========================
// Messages
// ========================

export const getMessages = (contactId: string, limit = 50) =>
  apiRequest(`/api/messages/${contactId}?limit=${limit}`);
