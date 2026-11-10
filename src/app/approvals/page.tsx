import { Tracker } from "../../components/tracker.tsx";

export default function Page() {
  return <Tracker view="approvals" initialStatus="PENDING_REVIEW" />;
}
