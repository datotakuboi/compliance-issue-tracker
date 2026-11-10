import { Tracker } from "../../components/tracker.tsx";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  return (
    <Tracker
      view="issues"
      initialStatus={typeof filters.status === "string" ? filters.status : ""}
      initialOverdue={filters.overdue === "true"}
    />
  );
}
