-- Ledger: money received against invoices (or "general" for a company).
-- Adds TWO new, empty tables (payments, quotation_invoices). Does not change or copy any existing
-- invoice, quotation, company or profile. Safe to run more than once.
-- All or nothing: if any line fails, nothing is changed.
begin;

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                                   -- same owner id as documents.user_id
  company_id  uuid not null references public.companies(id) on delete restrict,
  invoice_id  uuid references public.documents(id) on delete set null,  -- null = general payment for the company
  kind        text not null default 'payment' check (kind in ('payment', 'adjustment')),
  paid_on     date not null default current_date,
  amount      numeric(12,2) not null default 0 check (amount >= 0),
  tds         numeric(12,2) not null default 0 check (tds >= 0),  -- TDS kept by the client, counts as received
  mode        text check (mode in ('upi', 'bank', 'cheque', 'cash', 'other')),
  reference   text,
  note        text,
  voided_at   timestamptz,                                     -- "removed" payments stay visible, never deleted
  created_at  timestamptz not null default now(),
  constraint payments_nonzero check (amount + tds > 0)
);

create index if not exists payments_user_company_idx on public.payments (user_id, company_id);
create index if not exists payments_company_idx on public.payments (company_id);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

-- Access follows the companies table: if you can see the company, you can see its payments.
-- This reuses whatever rules already protect companies (including the shared login).
alter table public.payments enable row level security;

drop policy if exists payments_via_company on public.payments;
create policy payments_via_company on public.payments
  for all to authenticated
  using (exists (select 1 from public.companies c where c.id = payments.company_id))
  with check (exists (select 1 from public.companies c where c.id = payments.company_id));

-- Payments are never deleted from the app (only marked removed), so no delete grant is needed.
grant select, insert, update on public.payments to authenticated;

-- Quotation → invoice: remembers which invoice was made from which quotation, so the
-- same quotation is not turned into an invoice twice. New, empty table; the quotation
-- and invoice rows themselves are never changed.
create table if not exists public.quotation_invoices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  quotation_id  uuid not null references public.documents(id) on delete cascade,
  invoice_id    uuid not null references public.documents(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint quotation_invoices_one_link_per_invoice unique (invoice_id)
);

create index if not exists quotation_invoices_quotation_idx on public.quotation_invoices (quotation_id);

alter table public.quotation_invoices enable row level security;

drop policy if exists quotation_invoices_via_documents on public.quotation_invoices;
create policy quotation_invoices_via_documents on public.quotation_invoices
  for all to authenticated
  using (exists (select 1 from public.documents d where d.id = quotation_invoices.quotation_id))
  with check (
    exists (select 1 from public.documents d where d.id = quotation_invoices.quotation_id and d.type = 'quotation')
    and exists (select 1 from public.documents d where d.id = quotation_invoices.invoice_id and d.type = 'invoice')
  );

grant select, insert on public.quotation_invoices to authenticated;

commit;
