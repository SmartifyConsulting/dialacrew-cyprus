-- Composite crew recommendation score: quality remains dominant, budget value and verified wrap efficiency are additional factors.
-- Wrap speed is compared with peers using the same equipment ownership classification once available.
CREATE OR REPLACE VIEW public.crew_recommendation_scores AS
WITH wrap_stats AS (
 SELECT w.crew_id,COUNT(*)::integer AS wrap_count,
 ROUND(AVG(EXTRACT(EPOCH FROM (w.left_at-w.wrapped_at))/60)::numeric,1) AS avg_wrap_minutes
 FROM public.site_wraps w WHERE w.left_at IS NOT NULL AND w.left_at>=w.wrapped_at
 GROUP BY w.crew_id
), wrap_benchmark AS (
 SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_wrap_minutes) AS median_minutes
 FROM wrap_stats WHERE wrap_count>=3
)
SELECT c.id AS crew_id,
 ROUND(COALESCE(c.rating,0)::numeric,2) AS review_rating,
 COALESCE(rc.discounted_daily_rate,false) AS discounted_daily_rate,
 CASE WHEN rc.hourly_rate>0 AND rc.daily_rate>0 THEN ROUND(GREATEST(0,LEAST(1,1-rc.daily_rate/(rc.hourly_rate*8)))::numeric,3) ELSE 0 END AS daily_discount_fraction,
 COALESCE(w.wrap_count,0) AS verified_wrap_count,w.avg_wrap_minutes,
 ROUND((
  COALESCE(c.rating,0)::numeric*0.80
  + CASE WHEN COALESCE(rc.discounted_daily_rate,false) THEN 0.5*LEAST(1,(1-rc.daily_rate/(rc.hourly_rate*8))/0.20) ELSE 0 END
  + CASE WHEN COALESCE(w.wrap_count,0)<3 OR b.median_minutes IS NULL OR b.median_minutes<=0 THEN 0.25
    ELSE 0.5*LEAST(1,GREATEST(0,(2*b.median_minutes-COALESCE(w.avg_wrap_minutes,b.median_minutes))/(2*b.median_minutes))) END
 )::numeric,2) AS overall_score
FROM public.crew_members c
LEFT JOIN public.crew_rate_cards rc ON rc.crew_id=c.id
LEFT JOIN wrap_stats w ON w.crew_id=c.id
CROSS JOIN wrap_benchmark b;
GRANT SELECT ON public.crew_recommendation_scores TO authenticated;
