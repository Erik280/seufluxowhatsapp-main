import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import ChatView from './ChatView';
import KanbanView from './KanbanView';

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<'chat' | 'kanban' | 'settings'>('chat');

  return (
    <DashboardLayout activeView={activeView} onViewChange={setActiveView}>
      {activeView === 'chat' && <ChatView />}
      {activeView === 'kanban' && <KanbanView />}
      {activeView === 'settings' && (
        <div style={{ color: 'white', padding: '50px', textAlign: 'center' }}>
          <h2>Configurações (Em Breve)</h2>
        </div>
      )}
    </DashboardLayout>
  );
}
