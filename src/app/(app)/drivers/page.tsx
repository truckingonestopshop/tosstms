import { redirect } from "next/navigation";

// Drivers now live in Equipment & Drivers (with Units, Trucks and Trailers of every company).
export default async function DriversPage({ searchParams }: PageProps<"/drivers">) {
  const p = await searchParams;
  const driver = typeof p.driver === "string" ? `&driver=${encodeURIComponent(p.driver)}` : "";
  redirect(`/equipment?tab=drivers${driver}`);
}
