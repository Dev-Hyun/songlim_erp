export type ContractStatus = "진행중" | "보류" | "완료";

export interface ContractListItem {
  id: number;
  title: string;
  author_id: number;
  hospital_id: number | null;
  status: ContractStatus;
  buyer_hospital: string | null;
  sale_amount: number;
  created_at: string;
  updated_at: string;
  comment_count: number;
}

export interface ContractItemRow {
  id: number;
  name: string;
  qty: string | null;
  note: string | null;
}

export interface ContractPhotoRow {
  id: number;
  image_key: string;
  caption: string | null;
}

export interface ContractCommentRow {
  id: number;
  user_id: number;
  body: string;
  created_at: string;
}

export interface ContractDetail {
  contract: ContractListItem & {
    body: string | null;
    contract_date: string | null;
    buyer_biz_no: string | null;
    buyer_rep: string | null;
    buyer_address: string | null;
    buyer_phone: string | null;
    buyer_mobile: string | null;
    buyer_fax: string | null;
    sale_amount_note: string | null;
    etc_note: string | null;
    customer_request: string | null;
    install_date: string | null;
  };
  items: ContractItemRow[];
  photos: ContractPhotoRow[];
  comments: ContractCommentRow[];
}
