[out:json][timeout:300];
area["name"="Jharkhand"]["admin_level"="4"]->.s;
rel(area.s)["boundary"="administrative"]["admin_level"="5"]->.d;
foreach.d->.r(
  .r out tags;
  .r map_to_area->.a;
  nwr(area.a)["place"~"^(village|hamlet)$"]["name"];
  out center qt;
);
