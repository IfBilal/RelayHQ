begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('94000000-0000-0000-0000-00000000000a', 'owner@p.test',  'authenticated', 'authenticated', now()),
  ('94000000-0000-0000-0000-0000000000a1', 'user@p.test',   'authenticated', 'authenticated', now()),
  ('94000000-0000-0000-0000-00000000000b', 'owner@q.test',  'authenticated', 'authenticated', now());

select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Pay Co', 'payco')$$, 'workspace A');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000b');
select lives_ok($$select public.create_workspace('Other Pay', 'otherpay')$$, 'workspace B');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'payco') as ws,
  (select id from public.workspaces where slug = 'otherpay') as ws_b,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'payco' and r.name = 'User') as user_role;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, '94000000-0000-0000-0000-0000000000a1'::uuid, 'user', user_role from ctx;
insert into public.contacts (workspace_id, name) select ws, 'Pay Contact' from ctx;
insert into public.contacts (workspace_id, name) select ws_b, 'Other Contact' from ctx;
insert into public.opportunities (workspace_id, pipeline_id, stage_id, contact_id, title)
  select c.ws, p.id, (select id from public.stages where pipeline_id = p.id order by position limit 1), (select id from public.contacts where workspace_id = c.ws), 'Pay Opp'
  from ctx c join public.pipelines p on p.workspace_id = c.ws;
insert into public.opportunities (workspace_id, pipeline_id, stage_id, contact_id, title)
  select c.ws_b, p.id, (select id from public.stages where pipeline_id = p.id order by position limit 1), (select id from public.contacts where workspace_id = c.ws_b), 'Foreign Opp'
  from ctx c join public.pipelines p on p.workspace_id = c.ws_b;
create temp table opp as select
  (select id from public.opportunities where title = 'Pay Opp') as mine,
  (select id from public.opportunities where title = 'Foreign Opp') as foreign_opp;
grant select on ctx, opp to authenticated;

-- creating requests: permission, tenant, amount
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.create_payment_request(%L, %L, 5000, 'USD')$$, (select ws from ctx), (select mine from opp)), '42501', null, 'a User without payment.create cannot request a payment');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select throws_ok(format($$select public.create_payment_request(%L, %L, 5000, 'USD')$$, (select ws from ctx), (select foreign_opp from opp)), 'P0002', null, 'cannot request a payment for another workspace''s opportunity');
select throws_ok(format($$select public.create_payment_request(%L, %L, 10, 'USD')$$, (select ws from ctx), (select mine from opp)), '22023', null, 'amount below the minimum is rejected');
select lives_ok(format($$select public.create_payment_request(%L, %L, 12500, 'USD')$$, (select ws from ctx), (select mine from opp)), 'owner requests 125.00 USD');
reset role;
create temp table pr as select id from public.payment_requests where amount_minor = 12500;
grant select on pr to authenticated;
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.attach_checkout_session(%L, %L, 'cs_test_a1B2c3', 'https://checkout.stripe.com/c/pay/cs_test_a1B2c3')$$, (select ws from ctx), (select id from pr)), 'checkout session attached');
select throws_ok(format($$select public.attach_checkout_session(%L, %L, 'cs_test_zzz', 'https://evil.test/x')$$, (select ws from ctx), (select id from pr)), '22023', null, 'only a Stripe checkout URL is accepted');

-- nobody but the service role can apply provider events
select throws_ok($$select public.apply_stripe_event('evt_forged1', 'checkout.session.completed', 'h', '{"id":"cs_test_a1B2c3","payment_status":"paid","amount_total":12500,"currency":"usd"}'::jsonb)$$, '42501', null, 'an authenticated user cannot apply a payment event');
reset role;
set local role anon;
select throws_ok($$select public.apply_stripe_event('evt_forged2', 'checkout.session.completed', 'h', '{}'::jsonb)$$, '42501', null, 'anon cannot apply a payment event');
reset role;

-- webhook applier as the service role
set local role service_role;
select is(public.apply_stripe_event('evt_p1', 'checkout.session.completed', 'h1', '{"id":"cs_test_a1B2c3","payment_status":"unpaid","amount_total":12500,"currency":"usd"}'::jsonb), 'ignored', 'unpaid session is ignored');
select is(public.apply_stripe_event('evt_p2', 'checkout.session.completed', 'h2', '{"id":"cs_test_a1B2c3","payment_status":"paid","amount_total":999,"currency":"usd","payment_intent":"pi_1"}'::jsonb), 'mismatch', 'amount mismatch is not marked paid');
reset role;
select is((select status from public.payment_requests where id = (select id from pr)), 'failed', 'mismatch flags the request failed');
update public.payment_requests set status = 'pending', failure_reason = null where id = (select id from pr);
set local role service_role;
select is(public.apply_stripe_event('evt_p3', 'checkout.session.completed', 'h3', '{"id":"cs_test_a1B2c3","payment_status":"paid","amount_total":12500,"currency":"usd","payment_intent":"pi_1"}'::jsonb), 'processed', 'signed paid event marks the payment paid');
select is(public.apply_stripe_event('evt_p3', 'checkout.session.completed', 'h3', '{"id":"cs_test_a1B2c3","payment_status":"paid","amount_total":12500,"currency":"usd","payment_intent":"pi_1"}'::jsonb), 'duplicate', 'replaying the same event id is a duplicate');
select is(public.apply_stripe_event('evt_p4', 'checkout.session.completed', 'h4', '{"id":"cs_test_a1B2c3","payment_status":"paid","amount_total":12500,"currency":"usd","payment_intent":"pi_1"}'::jsonb), 'ignored', 'a second completion event does not double count');
select is(public.apply_stripe_event('evt_p5', 'checkout.session.completed', 'h5', '{"id":"cs_test_unknown","payment_status":"paid","amount_total":1,"currency":"usd"}'::jsonb), 'ignored', 'unknown session is ignored');
reset role;
select is((select status from public.payment_requests where id = (select id from pr)), 'paid', 'request is paid');
select is((select deliveries from public.integration_events where event_id = 'evt_p3'), 2, 'duplicate delivery is counted');

-- collected figure
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select is((select collected_minor from public.collected_summary((select ws from ctx))), 12500::bigint, 'collected = verified gross');
select pg_temp.as_user('94000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select * from public.collected_summary(%L)$$, (select ws from ctx)), '42501', null, 'collected is hidden from users without the value permission');
select is((select count(*)::int from public.payment_requests), 0, 'users without payment/value permission see no payments');

-- partial then full refund
reset role;
set local role service_role;
select is(public.apply_stripe_event('evt_r1', 'charge.refunded', 'h6', '{"payment_intent":"pi_1","amount_refunded":2500,"refunds":{"data":[{"id":"re_1","status":"succeeded","amount":2500}]}}'::jsonb), 'processed', 'partial refund applied');
reset role;
select is((select status from public.payment_requests where id = (select id from pr)), 'partially_refunded', 'status partially_refunded');
set local role service_role;
select is(public.apply_stripe_event('evt_r2', 'charge.refunded', 'h7', '{"payment_intent":"pi_1","amount_refunded":12500,"refunds":{"data":[{"id":"re_1","status":"succeeded","amount":2500},{"id":"re_2","status":"succeeded","amount":10000}]}}'::jsonb), 'processed', 'full refund applied');
reset role;
select is((select status from public.payment_requests where id = (select id from pr)), 'refunded', 'status refunded');
select is((select count(*)::int from public.payment_refunds), 2, 'each refund stored once');
select pg_temp.as_user('94000000-0000-0000-0000-00000000000a');
select is((select collected_minor from public.collected_summary((select ws from ctx))), 0::bigint, 'collected = gross minus confirmed refunds');

-- tenant isolation
select pg_temp.as_user('94000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.payment_requests), 0, 'workspace B sees none of A''s payments');
select is((select count(*)::int from public.integration_events), 0, 'workspace B sees none of A''s events');

select * from finish();
rollback;
