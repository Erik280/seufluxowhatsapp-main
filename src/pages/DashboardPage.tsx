import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ChatView from './ChatView';
import KanbanView from './KanbanView';
import SettingsView from './SettingsView';
import MediaLibraryView from './MediaLibraryView';
import FlowBuilderView from './FlowBuilderView';
import CampaignView from './CampaignView';
import QuickRepliesView from './QuickRepliesView';
import TeamManagementView from './TeamManagementView';

type ViewType = 'chat' | 'kanban' | 'settings' | 'media' | 'flows' | 'campaigns' | 'quick-replies' | 'team';

const VALID_VIEWS: ViewType[] = ['chat', 'kanban', 'settings', 'media', 'flows', 'campaigns', 'quick-replies', 'team'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { '*': wildcard } = useParams();

  // Derive activeView from the URL; default to 'chat'
  const activeView: ViewType = VALID_VIEWS.includes(wildcard as ViewType)
    ? (wildcard as ViewType)
    : 'chat';

  const handleViewChange = (view: ViewType) => {
    navigate(`/dashboard/${view}`);
  };

  return (
    <DashboardLayout activeView={activeView} onViewChange={handleViewChange}>
      {activeView === 'chat'          && <ChatView />}
      {activeView === 'kanban'        && <KanbanView />}
      {activeView === 'settings'      && <SettingsView />}
      {activeView === 'media'         && <MediaLibraryView />}
      {activeView === 'flows'         && <FlowBuilderView />}
      {activeView === 'campaigns'     && <CampaignView />}
      {activeView === 'quick-replies' && <QuickRepliesView />}
      {activeView === 'team'          && <TeamManagementView />}
    </DashboardLayout>
  );
}
