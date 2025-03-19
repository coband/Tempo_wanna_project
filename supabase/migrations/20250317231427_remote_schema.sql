alter table "auth"."users" add column "user_role" text default 'user'::text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION auth.clerk_jwt_claims()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
    SELECT COALESCE(
        current_setting('request.jwt.claims', true)::jsonb,
        '{}'::jsonb
    );
$function$
;

CREATE OR REPLACE FUNCTION auth.is_clerk_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.is_clerk_admin();
$function$
;

CREATE OR REPLACE FUNCTION auth.is_clerk_authenticated()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.is_clerk_authenticated();
$function$
;

CREATE OR REPLACE FUNCTION auth.is_clerk_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.is_clerk_superadmin();
$function$
;

CREATE OR REPLACE FUNCTION auth.requesting_user_id()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
     SELECT public.requesting_user_id();
   $function$
;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
    SELECT CASE 
        WHEN auth.is_clerk_authenticated() THEN 'authenticated'
        ELSE 'anon'
    END;
$function$
;


grant delete on table "storage"."s3_multipart_uploads" to "postgres";

grant insert on table "storage"."s3_multipart_uploads" to "postgres";

grant references on table "storage"."s3_multipart_uploads" to "postgres";

grant select on table "storage"."s3_multipart_uploads" to "postgres";

grant trigger on table "storage"."s3_multipart_uploads" to "postgres";

grant truncate on table "storage"."s3_multipart_uploads" to "postgres";

grant update on table "storage"."s3_multipart_uploads" to "postgres";

grant delete on table "storage"."s3_multipart_uploads_parts" to "postgres";

grant insert on table "storage"."s3_multipart_uploads_parts" to "postgres";

grant references on table "storage"."s3_multipart_uploads_parts" to "postgres";

grant select on table "storage"."s3_multipart_uploads_parts" to "postgres";

grant trigger on table "storage"."s3_multipart_uploads_parts" to "postgres";

grant truncate on table "storage"."s3_multipart_uploads_parts" to "postgres";

grant update on table "storage"."s3_multipart_uploads_parts" to "postgres";


