-- Record equipment responsibility per actual wrap event, not per crew profile.
ALTER TABLE public.site_wraps ADD COLUMN IF NOT EXISTS equipment_source text NOT NULL DEFAULT 'unknown'
 CHECK (equipment_source IN ('own','producer','mixed','none','unknown'));
ALTER TABLE public.site_wraps ADD COLUMN IF NOT EXISTS wrap_role text;
-- Existing wrap records remain unknown; do not guess equipment ownership.
-- Group peers by actual job role and equipment source. Only compare groups with 3+ completed events.
CREATE OR REPLACE VIEW public.crew_recommendation_scores AS
WITH valid_wraps AS (
 SELECT w.crew_id,lower(trim(coalesce(w.wrap_role,b.role,c.role))) AS role_group,
 w.equipment_source,
 EXTRACT(EPOCH FROM (w.left_at-w.wrapped_at))/60 AS minutes
 FROM public.site_wraps w
 JOIN public.crew_members c ON c.id=w.crew_id
 LEFT JOIN LATERAL (SELECT bk.role FROM public.bookings bk WHERE bk.production_id=w.production_id AND bk.crew_id=w.crew_id ORDER BY bk.created_at DESC LIMIT 1) b ON true
 WHERE w.left_at IS NOT NULL AND w.left_at>=w.wrapped_at
), peer_groups AS (
 SELECT role_group,equipment_source,
 COUNT(*) AS samples,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS median_minutes
 FROM valid_wraps WHERE equipment_source<>'unknown'
 GROUP BY role_group,equipment_source
 HAVING COUNT(*)>=3
), scored_wraps AS (
 SELECT v.crew_id,v.minutes,
 CASE WHEN p.median_minutes>0 THEN
 LEAST(1,GREATEST(0,(2*p.median_minutes-v.minutes)/(2*p.median_minutes)))
 ELSE NULL END AS efficiency
 FROM valid_wraps v
 LEFT JOIN peer_groups p ON p.role_group=v.role_group AND p.equipment_source=v.equipment_source
), wrap_stats AS (
 SELECT crew_id,COUNT(*)::integer AS wrap_count,
 ROUND(AVG(minutes)::numeric,1) AS avg_wrap_minutes,
 COUNT(efficiency)::integer AS comparable_wrap_count,
 AVG(efficiency) AS avg_efficiency
 FROM scored_wraps GROUP BY crew_id
)
SELECT c.id AS crew_id,
 ROUND(COALESCE(c.rating,0)::numeric,2) AS review_rating,
 COALESCE(rc.discounted_daily_rate,false) AS discounted_daily_rate,
 CASE WHEN rc.hourly_rate>0 AND rc.daily_rate>0 THEN ROUND(GREATEST(0,LEAST(1,1-rc.daily_rate/(rc.hourly_rate*8)))::numeric,3) ELSE 0 END AS daily_discount_fraction,
 COALESCE(w.wrap_count,0) AS verified_wrap_count,w.avg_wrap_minutes,
 COALESCE(w.comparable_wrap_count,0) AS comparable_wrap_count,
 ROUND((
  COALESCE(c.rating,0)::numeric*0.80
  + CASE WHEN COALESCE(rc.discounted_daily_rate,false) THEN 0.5*LEAST(1,(1-rc.daily_rate/(rc.hourly_rate*8))/0.20) ELSE 0 END
  + CASE WHEN COALESCE(w.comparable_wrap_count,0)<3 THEN 0.25
    ELSE 0.5*COALESCE(w.avg_efficiency,0.5) END
 )::numeric,2) AS overall_score
FROM public.crew_members c
LEFT JOIN public.crew_rate_cards rc ON rc.crew_id=c.id
LEFT JOIN wrap_stats w ON w.crew_id=c.id;
GRANT SELECT ON public.crew_recommendation_scores TO authenticated;
