import { Tracker } from "../../../components/tracker.tsx";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Tracker view="issues" issueId={(await params).id} />;
}
