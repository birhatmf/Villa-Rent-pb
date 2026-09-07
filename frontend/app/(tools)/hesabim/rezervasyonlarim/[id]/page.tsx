import ReservationDetail from '@/components/admin/ReservationDetail';

export default async function HostReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReservationDetail id={id} scope="host" />;
}
