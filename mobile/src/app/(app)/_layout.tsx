import AppTabs from '@/components/app-tabs';

// The authenticated area. Renders the existing NativeTabs shell; its `index` and
// `explore` triggers resolve to the sibling routes in this (app) group.
export default function AppLayout() {
  return <AppTabs />;
}
