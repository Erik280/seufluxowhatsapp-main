import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import ChatView from './ChatView';
import KanbanView from './KanbanView';
import SettingsView from './SettingsView';

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<'chat' | 'kanban' | 'settings'>('chat');

  return (
    <DashboardLayout activeView={activeView} onViewChange={setActiveView}>
      {activeView === 'chat' && <ChatView />}
      {activeView === 'kanban' && <KanbanView />}
      {activeView === 'settings' && <SettingsView />}
    </DashboardLayout>
  );
}
