import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import NoticeDetailClient from "@/components/board/NoticeDetailClient";

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="공지사항" />
      <NoticeDetailClient id={Number(id)} />
    </div>
  );
}
