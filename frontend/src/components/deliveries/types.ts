export type SiteType = "delivery" | "demo";

export interface DeliveryListItem {
  id: number;
  category: string;
  hospital_name: string;
  hospital_type: string | null;
  installation_date: string | null;
  installation_location: string | null;
  rep_doctor: string | null;
  address: string | null;
  person_in_charge: string | null;
  created_by: number;
  site_type: SiteType;
  warranty_start: string | null;
  warranty_end: string | null;
  maintenance: string | null;
  demo_result: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryItemRow {
  id: number;
  description: string | null;
  serial_no: string | null;
  price: number | null;
  sys_id: string | null;
}

export interface DeliveryPhotoRow {
  id: number;
  image_key: string;
}

export interface DeliveryCommentRow {
  id: number;
  user_id: number;
  content: string;
  created_at: string;
}

export interface DeliveryDetail {
  delivery: DeliveryListItem;
  items: DeliveryItemRow[];
  photos: DeliveryPhotoRow[];
  comments: DeliveryCommentRow[];
}
