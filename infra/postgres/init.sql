-- EntradasYa v1 — crea una base y un usuario por servicio.
-- Ejecutar como superusuario (postgres):
--   psql -U postgres -f infra/postgres/init.sql
-- Las contraseñas son SOLO para desarrollo local. Cambiarlas en el servidor.

CREATE USER auth_user     WITH PASSWORD 'auth_pass';
CREATE USER events_user   WITH PASSWORD 'events_pass';
CREATE USER orders_user   WITH PASSWORD 'orders_pass';
CREATE USER payments_user WITH PASSWORD 'payments_pass';
CREATE USER tickets_user  WITH PASSWORD 'tickets_pass';
CREATE USER checkin_user  WITH PASSWORD 'checkin_pass';

-- CREATEDB solo para que Prisma pueda crear la "shadow database" en desarrollo.
ALTER USER auth_user     CREATEDB;
ALTER USER events_user   CREATEDB;
ALTER USER orders_user   CREATEDB;
ALTER USER payments_user CREATEDB;
ALTER USER tickets_user  CREATEDB;
ALTER USER checkin_user  CREATEDB;

CREATE DATABASE auth_db     OWNER auth_user;
CREATE DATABASE events_db   OWNER events_user;
CREATE DATABASE orders_db   OWNER orders_user;
CREATE DATABASE payments_db OWNER payments_user;
CREATE DATABASE tickets_db  OWNER tickets_user;
CREATE DATABASE checkin_db  OWNER checkin_user;

-- Cada usuario solo puede conectarse a su propia base.
REVOKE CONNECT ON DATABASE auth_db, events_db, orders_db, payments_db, tickets_db, checkin_db FROM PUBLIC;
GRANT CONNECT ON DATABASE auth_db     TO auth_user;
GRANT CONNECT ON DATABASE events_db   TO events_user;
GRANT CONNECT ON DATABASE orders_db   TO orders_user;
GRANT CONNECT ON DATABASE payments_db TO payments_user;
GRANT CONNECT ON DATABASE tickets_db  TO tickets_user;
GRANT CONNECT ON DATABASE checkin_db  TO checkin_user;
