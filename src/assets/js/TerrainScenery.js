// Overhead vector detail generated in world space and attached to each shelf.
// No image planes: roads, roofs and trees are drawn as flat blocks.
export const terrainSceneryShader = `
  float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float terrainBox(vec2 p,vec2 centre,vec2 extent,float aa){
    vec2 d=abs(p-centre)-extent;
    return 1.-smoothstep(0.,aa,max(d.x,d.y));
  }
  float terrainNoise(vec2 point){
    vec2 cell=floor(point),f=fract(point);
    vec2 blend=f*f*(3.-2.*f);
    return mix(mix(terrainHash(cell),terrainHash(cell+vec2(1.,0.)),blend.x),
      mix(terrainHash(cell+vec2(0.,1.)),terrainHash(cell+vec2(1.)),blend.x),blend.y);
  }
  float terrainHeight(vec2 p){
    // Connected hills and valleys; contour lines follow a shared elevation field.
    p*=.065;
    return terrainNoise(p)*.58+terrainNoise(p*2.1+7.3)*.28+terrainNoise(p*4.3+19.7)*.14;
  }
  float terrainContour(float elevation,float intervals,float thickness){
    float level=elevation*intervals;
    float distanceToLine=abs(fract(level+.5)-.5);
    float aa=max(fwidth(level),.0001);
    return 1.-smoothstep(aa*thickness*.35,aa*thickness,distanceToLine);
  }
  vec3 terrainMap(vec3 fill,vec3 ink,vec2 point,float intervals){
    float elevation=terrainHeight(point);
    float minor=terrainContour(elevation,intervals,1.);
    float major=terrainContour(elevation,intervals/4.,1.7);
    vec3 relief=fill*(.76+elevation*.5);
    return mix(relief,ink,max(minor*.32,major*.62));
  }
  vec3 terrainDetails(vec3 color,vec2 point,float layer){
    // Derivatives must use continuous world coordinates, before mod/floor and
    // conditional parcels. Wrapped coordinates create screen-wide seam artifacts.
    float aa=max(max(fwidth(point.x),fwidth(point.y)),.0001);
    vec2 district=floor(point/12.);
    vec2 local=mod(point+6.,12.)-6.;
    float seed=terrainHash(district+layer*17.);
    vec3 asphalt=vec3(.028,.014,.045);
    float roadX=1.-smoothstep(.18,.24,abs(local.x));
    // Long cross-arena road strips read as stray horizontal lines in flight.
    float road=roadX*step(.28,seed);
    color=mix(color,asphalt,road*.85);
    float marking=(1.-smoothstep(.012,.035,abs(local.x)))*step(.48,fract((local.x+local.y)*.65));
    color=mix(color,vec3(.11,.07,.18),marking*road*.65);
    vec2 parcel=floor((local+6.)/2.4);
    vec2 p=mod(local+6.,2.4)-1.2;
    float lot=terrainHash(parcel+district*5.+layer*31.);
    if(terrainHeight(point+layer*13.)>.49&&lot>.5&&roadX<.1){
      // Four stepped tree crowns and a tiny trunk / offset block shadow.
        vec2 tree=p-vec2(fract(lot*3.)-.5,fract(lot*7.)-.5)*.8;
        float shadow=terrainBox(tree,vec2(.12,-.12),vec2(.32,.28),aa);
        float crown=max(terrainBox(tree,vec2(0.),vec2(.30,.14),aa),terrainBox(tree,vec2(0.),vec2(.14,.30),aa));
        color=mix(color,vec3(.008,.004,.017),shadow*.8);
        color=mix(color,mix(vec3(.012,.08,.045),vec3(.026,.11,.065),lot),crown*.85);
        color=mix(color,vec3(.045,.18,.08),terrainBox(tree,vec2(-.08,.08),vec2(.08),aa)*.6);
    }
    // Districts alternate empty rock, small settlements, and denser city blocks.
    if(seed>.68&&lot>.28&&roadX<.1){
      vec2 extent=vec2(.28+lot*.26,.24+fract(lot*7.)*.35);
      float shadow=terrainBox(p,vec2(.13,-.14),extent+.06,aa);
      float roof=terrainBox(p,vec2(0.),extent,aa);
      float inset=terrainBox(p,vec2(0.),max(extent-.065,vec2(.05)),aa);
      vec3 trim=mix(vec3(.09,.04,.15),vec3(.034,.11,.13),fract(lot*9.));
      color=mix(color,vec3(.004,.002,.012),shadow*.85);
      color=mix(color,trim,roof*.8);
      color=mix(color,vec3(.025,.012,.045)*(1.+lot*.5),inset*.9);
      float skylight=terrainBox(p,vec2(-extent.x*.35,extent.y*.25),vec2(.045,.10),aa);
      color=mix(color,vec3(.23,.13,.035),skylight*.75);
    }
    return color;
  }
`;
