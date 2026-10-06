CREATE TABLE public.productions (
  id text PRIMARY KEY DEFAULT ('p' || substr(md5(random()::text),1,10)),
  name text NOT NULL, client text NOT NULL, type text NOT NULL DEFAULT 'Commercial',
  location text NOT NULL DEFAULT '', date date, days int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'Upcoming', budget numeric NOT NULL DEFAULT 0,
  crew_booked int NOT NULL DEFAULT 0, crew_needed int NOT NULL DEFAULT 0,
  secured_funds numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crew_members (
  id text PRIMARY KEY DEFAULT ('c' || substr(md5(random()::text),1,10)),
  name text NOT NULL, role text NOT NULL, department text NOT NULL, location text NOT NULL DEFAULT '',
  rating numeric NOT NULL DEFAULT 0, day_rate numeric NOT NULL DEFAULT 0, available boolean NOT NULL DEFAULT true,
  experience int NOT NULL DEFAULT 0, kit text, pencilled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bookings (
  id text PRIMARY KEY DEFAULT ('b' || substr(md5(random()::text),1,10)),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  role text NOT NULL, status text NOT NULL DEFAULT 'Pencil',
  crew_rate numeric NOT NULL DEFAULT 0, client_charge numeric NOT NULL DEFAULT 0,
  days int NOT NULL DEFAULT 1, attendance text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.change_requests (
  id text PRIMARY KEY DEFAULT ('r' || substr(md5(random()::text),1,10)),
  kind text NOT NULL, production text NOT NULL, who text NOT NULL, detail text NOT NULL,
  amount numeric NOT NULL DEFAULT 0, state text NOT NULL DEFAULT 'Pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.productions, public.crew_members, public.bookings, public.change_requests TO anon, authenticated;
GRANT ALL ON public.productions, public.crew_members, public.bookings, public.change_requests TO service_role;

ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

-- Temporary open access until sign-in is added
CREATE POLICY "open access" ON public.productions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open access" ON public.crew_members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open access" ON public.bookings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open access" ON public.change_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.productions (id,name,client,type,location,date,days,status,budget,crew_booked,crew_needed,secured_funds) VALUES
('p1','Savanna Gin — Summer TVC','Savanna Drinks Co.','Commercial','Cape Town, Camps Bay','2026-10-12',3,'Active',1250000,22,26,480000),
('p2','Northbound — Feature Film','Atlas Pictures','Film','Johannesburg','2026-11-02',28,'Upcoming',8900000,31,54,2100000),
('p3','Velvet Lookbook AW26','Velvet Studio','Photography','Stellenbosch','2026-10-18',1,'Upcoming',145000,6,8,60000),
('p4','Kinetic Bank — Brand Film','Kinetic Bank','Commercial','Durban','2026-09-20',2,'Wrapped',720000,18,18,0);

INSERT INTO public.crew_members (id,name,role,department,location,rating,day_rate,available,experience,kit) VALUES
('c1','Thandi Mokoena','Director of Photography','Camera','Cape Town',4.9,8500,true,12,'ARRI Alexa Mini LF'),
('c2','Pieter van Wyk','Gaffer','Lighting','Cape Town',4.8,5200,false,15,'3-ton lighting truck'),
('c3','Lerato Dlamini','1st AC','Camera','Johannesburg',4.7,3800,true,7,NULL),
('c4','Sam Naidoo','Sound Recordist','Sound','Durban',4.6,4200,true,9,'Sound Devices 888'),
('c5','Ayesha Patel','Make Up Artist','Hair & Makeup','Cape Town',5.0,3500,true,11,NULL),
('c6','Johan Botha','Key Grip','Grip','Cape Town',4.5,4000,false,18,NULL),
('c7','Nomsa Khumalo','Art Director','Art Department','Johannesburg',4.8,6500,true,10,NULL),
('c8','Daniel Fourie','DIT','Camera','Cape Town',4.7,4500,true,6,'DaVinci Resolve cart'),
('c9','Zanele Mthembu','Wardrobe Stylist','Wardrobe','Stellenbosch',4.9,3900,true,8,NULL),
('c10','Marco Rossi','1st Assistant Director','Production','Cape Town',4.8,6000,false,14,NULL);

INSERT INTO public.bookings (id,production_id,crew_id,role,status,crew_rate,client_charge,days,attendance) VALUES
('b1','p1','c1','DOP','Confirmed',8500,10000,3,'On set'),
('b2','p1','c2','Gaffer','Confirmed',5200,6200,3,'On set'),
('b3','p1','c5','Make Up','Confirmed',3500,4200,3,'Late'),
('b4','p1','c8','DIT','Pending',4500,5400,3,'Not arrived'),
('b5','p2','c7','Art Director','Pencil',6500,7800,28,NULL),
('b6','p2','c3','1st AC','Pencil',3800,4500,28,NULL),
('b7','p3','c9','Wardrobe','Pending',3900,4600,1,NULL),
('b8','p2','c10','1st AD','Declined',6000,7200,28,NULL);

INSERT INTO public.change_requests (id,kind,production,who,detail,amount) VALUES
('r1','Overtime','Savanna Gin — Summer TVC','Pieter van Wyk','2h OT, Day 1 — sunset reshoot',1300),
('r2','Additional resource','Savanna Gin — Summer TVC','Thandi Mokoena','Extra camera assistant, 1 day',2800),
('r3','Equipment','Northbound — Feature Film','Nomsa Khumalo','Prop truck hire, 5 days',18000);