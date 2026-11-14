type MapPlace = { place_id?: string; data_id?: string; title?: string; address?: string; gps_coordinates?: { latitude?: number; longitude?: number } };
type Suggestion = { placeId?: string; display_name: string; name?: string; lat: string; lon: string; address: Record<string,string> };
type SearchResult = { provider: "serpapi"; results: Suggestion[]; error: string | null };
const cache = new Map<string,{expires:number;value:SearchResult}>();
const fail = (error:string):SearchResult => ({provider:"serpapi",results:[],error});
/** Google Maps search through SerpAPI. Credentials and provider raw errors stay server-side. */
export async function serpMapsSearch(q:string,country?:string):Promise<SearchResult> {
 // Match the existing Book a Crew project secret; retain standard aliases for other environments.
 const configured=[
  {name:"SERPAPI_AI_KEY",value:process.env["SERPAPI_AI_KEY"]},
  {name:"SERPAPI_API_KEY",value:process.env["SERPAPI_API_KEY"]},
  {name:"SERP_API_KEY",value:process.env["SERP_API_KEY"]},
 ].find(item=>item.value?.trim());
 const key=configured?.value?.trim() ?? "";
 if(!key)return fail("Maps search is not configured. Ask your administrator to add the SERPAPI_AI_KEY or SERPAPI_API_KEY server secret.");
 const region=country?.toUpperCase();
 const cacheKey=(region??"")+":"+q.trim().toLowerCase();const cached=cache.get(cacheKey);
 if(cached && cached.expires>Date.now())return cached.value;
 // Country text provides the geographic hint for search results; SerpAPI's gl affects place lookups only.
 const countryName=region ? new Intl.DisplayNames(["en"],{type:"region"}).of(region) : undefined;
 const query=countryName && !q.toLowerCase().includes(countryName.toLowerCase()) ? q.trim()+", "+countryName : q.trim();
 const params=new URLSearchParams({engine:"google_maps",type:"search",q:query,hl:"en",api_key:key});
 let response:Response;
 try{response=await fetch("https://serpapi.com/search.json?"+params,{signal:AbortSignal.timeout(20000)});}catch{return fail("Maps search could not connect to SerpAPI. Please try again.");}
 const body=await response.json().catch(()=>null) as {error?:unknown;local_results?:MapPlace[];place_results?:MapPlace}|null;
 if(!response.ok || !body || body.error){
  const detail=typeof body?.error==="string"?body.error.toLowerCase():"";
  if(/run out|quota|searches.*(left|limit)|credits|allowance/.test(detail))return fail("The SerpAPI search allowance has been reached. Ask your administrator to review the plan or try again later.");
  if(/verif/.test(detail))return fail("SerpAPI requires account verification. Ask your administrator to complete verification in the SerpAPI dashboard.");
  if(response.status===401 || /invalid.*key/.test(detail))return fail(`SerpAPI rejected the key saved as ${configured?.name}. Ask your administrator to replace that secret with the current SerpAPI API key.`);
  if(response.status===403)return fail("SerpAPI denied access to Maps search. Ask your administrator to check that the key and SerpAPI account are active.");
  if(response.status===429)return fail("The SerpAPI search allowance has been reached. Ask your administrator to review the plan or try again later.");
  return fail("SerpAPI could not complete this Maps search. Please try again or ask your administrator to check the account.");
 }
 const places=Array.isArray(body.local_results)?body.local_results:body.place_results?[body.place_results]:[];
 const results:Suggestion[]=[];const seen=new Set<string>();
 for(const place of places){const lat=place.gps_coordinates?.latitude,lon=place.gps_coordinates?.longitude;
  if(!place.address || typeof lat!=="number" || typeof lon!=="number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180)continue;
  const identity=place.place_id ?? place.address+":"+lat+":"+lon;if(seen.has(identity))continue;seen.add(identity);
  results.push({...(place.place_id?{placeId:place.place_id}:{}),display_name:place.address,...(place.title?{name:place.title}:{}),lat:String(lat),lon:String(lon),address:{}});if(results.length===6)break;
 }
 const value:SearchResult={provider:"serpapi",results,error:null};
 if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(cacheKey,{expires:Date.now()+300000,value});return value;
}
