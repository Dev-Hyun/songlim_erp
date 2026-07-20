import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CommunityDetailClient from "@/components/community/CommunityDetailClient";

export default async function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="게시글" />
      <CommunityDetailClient id={Number(id)} />
    </div>
  );
}
