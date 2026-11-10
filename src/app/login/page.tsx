import { Tracker } from "../../components/tracker.tsx";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  const returnTo = typeof next === "string" && /^\/(?:issues(?:\/[A-Za-z0-9_-]+)?|approvals)?$/.test(next) ? next : "/";
  return <Tracker view="dashboard" loginPage returnTo={returnTo} />;
}