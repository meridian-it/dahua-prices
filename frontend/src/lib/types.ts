export type PublicSettings = {
  site_name: string;
  site_tagline: string;
  brand_vendor: string;
  accent_color: string;
  meta_description: string;
  contact_phone: string;
  contact_email: string;
  contact_telegram: string;
  contact_address: string;
  work_hours: string;
  website_url: string;
  footer_note: string;
  show_prices: boolean;
  price_label: string;
  currency_symbol: string;
  price_on_request_text: string;
  page_size: number;
  compare_max: number;
  default_view: "table" | "grid";
  hide_eol: boolean;
  show_price_changes: boolean;
  search_examples: string;
};

export type Labels = {
  kinds: Record<string, string>;
  forms: Record<string, string>;
  tech: Record<string, string>;
  features: Record<string, string>;
  specs: Record<string, string>;
};

export type SiteConfig = {
  settings: PublicSettings;
  catalog: { updated_at: string | null; total: number };
  labels: Labels;
};

export type ProductBrief = {
  id: number;
  model: string;
  title: string;
  category: { slug: string; name: string } | null;
  group: string | null;
  kind: string;
  technology: string | null;
  form_factor: string | null;
  megapixels: number | null;
  features: string[];
  key_specs: string[];
  price: number | null;
  price_on_request: boolean;
  prev_price: number | null;
  price_trend: "up" | "down" | null;
  warranty_months: number | null;
  mpq: number | null;
  mpq_raw: string | null;
  is_new: boolean;
  is_eol: boolean;
  replacement_model: string | null;
  note: string | null;
  image_url: string | null;
  images: string[];
};

export type SpecRow = { key: string; label: string; value: string | number };

export type ProductFull = ProductBrief & {
  description: string;
  specs: SpecRow[];
  feature_labels: { key: string; label: string }[];
  warranty_raw: string | null;
  price_changed_at: string | null;
  updated_at: string | null;
  replacement?: ProductBrief | null;
  similar?: ProductBrief[];
  siblings?: { model: string; title: string; price: number | null }[];
};

export type FacetItem = { value: string; label: string; count: number };

export type Facets = {
  category: FacetItem[];
  kind: FacetItem[];
  tech: FacetItem[];
  form: FacetItem[];
  mp: (Omit<FacetItem, "value"> & { value: number })[];
  features: FacetItem[];
  price: { min: number | null; max: number | null };
};

export type QueryInfo = {
  raw: string;
  layout_fixed: string | null;
  chips: { type: string; label: string }[];
  model_tokens: string[];
  text_tokens: string[];
  fuzzy: boolean;
  suggestion: string | null;
};

export type SearchResponse = {
  items: ProductBrief[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  facets: Facets | null;
  query: QueryInfo;
};

export type SuggestItem = {
  id: number;
  model: string;
  kind: string;
  form_factor: string | null;
  title: string;
  price: number | null;
  price_on_request: boolean;
  key_specs: string[];
  image_url: string | null;
  is_eol: boolean;
  is_new: boolean;
};

export type SuggestResponse = {
  items: SuggestItem[];
  total: number;
  chips: { type: string; label: string }[];
  layout_fixed: string | null;
  fuzzy: boolean;
  categories: { slug: string; name: string }[];
};

export type CompareResponse = {
  items: ProductFull[];
  specs: { key: string; label: string; values: (string | number | null)[]; different: boolean }[];
  features: { key: string; label: string; values: boolean[]; different: boolean }[];
};

export type Breakdown = {
  rows: { kind: string; tech: string | null; form: string | null; count: number }[];
  new: number;
};

export type CategoryInfo = { slug: string; name: string; icon: string | null; count: number };
