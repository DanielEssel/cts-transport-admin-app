import AppLayout from '../layout-shell'
// One shell for every dashboard section. Being the group's layout, it stays
// mounted while navigating between sections, so the sidebar keeps its scroll
// position; a page added under (admin) gets the shell without its own layout.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
