// nostr-------------------
let isRelayLoaded = false;
// fields--------------------
let gW; /* world coordinate */
//entry point--------------------
let printstatus=function(str){
  document.getElementById("debug").innerHTML=str;
}
const printstatus_relaycount=function(instr, numer, denom){
  let str = instr+"<br>";
  for(let i=0;i<nrelay;i++){
    str+=numer[i]+" / "+ denom +" users in the relay "+ searchrelays[i];
    if(eoses[i]){
      str+=" (EOSE)";
    }
    str+="<br>"; 
  }
  document.getElementById("debug").innerHTML=str;
}
window.onload = async function(){
  initHtml();
  printstatus("please press start button");
  window.onresize();
}

let start = async function(){
  form1.startbutton.disabled = true;
  form1.skipbutton.disabled = false;

  limit = form1.limit.value;
  minfollow = form1.minfollow.value;

  if(!is_data_digits){
    //nostr
    await anaFollower();
    //await getProfile();
    await getLang();
    form1.skipbutton.disabled = true;
  }

  printstatus("initialize t-SNE...");
  await new Promise(resolve=>{setTimeout(()=>{
    initTsne();
    resolve();
  },0);});

  initDraw();
  initEvent(can);
  window.onresize();
  setInterval(procAll, 0); //enter gameloop
}
//nostr------------------
put_my_relay = async function(kind){
    printstatus("wait for your relays...");
    try{
      let s = await get_my_relay(kind);
      form1.searchrelays.value = "";
      for(relay of s){
        form1.searchrelays.value += relay + "\n";
      }
    }catch(e){
      printstatus(e);
    }
}
async function get_my_relay(kind){
  let bsrelay;
  if(window.nostr !== undefined){
    bsrelay = await window.nostr.getRelays();
  }else{
    throw "Please set NIP-07 browser extension."
  }
  let userrelays = Object.keys(bsrelay);
  let filter = [{"kinds":[kind],"authors":[await window.nostr.getPublicKey()]}];
  let results = await Promise.allSettled(userrelays.map(async (url)=>{
    let result = [];
    let relay;
    await Promise.race([new Promise(async (resolve, reject)=>{
      try{
        relay = await window.NostrTools.Relay.connect(url);
        resolve();
      }catch{
        return new Promise((resolve)=>{resolve([]);});
      }
    }),new Promise((resolve,reject)=>{
      setTimeout(reject, 1000);
    })]).catch(function(){
      return new Promise((resolve)=>{resolve([]);});
    });

    await new Promise(function(resolve){
      setTimeout(()=>{
        resolve();
      }, 3000);
      const sub = relay.subscribe(filter, {
        onevent:function(ev){
          if(kind==3){
            result.push({
              time     :ev.created_at,
              userrelays:Object.keys(JSON.parse(ev.content)),
              origin   :url,
            });
          }else if(kind==10002){
            let rl=[];
            for(t of ev.tags){
              rl.push(t[1]);
            }
            result.push({
              time     :ev.created_at,
              userrelays:rl,
              origin   :url,
            });
          }
        },
        oneose:function(){
          console.log("eose:"+url);
          sub.close();
          relay.close();
          resolve();
        }
      });
    });
    return result;
  }));
  
  latest = {time:0, userrelays:[]};
  for(r1 of results){
    if(r1.status=='rejected')continue;
    for(r2 of r1.value){
      if(r2.time > latest.time){
        latest = r2;
      }
    }
  }
  return latest.userrelays;
}
let searchrelays;
let nrelay;
let pubpool;
let friends;
let userrelays;
let nevents = [];
let eoses = [];
let npubonrelay;
let followers;
let npubEncode = window.NostrTools.nip19.npubEncode;

const anaFollower = async function(){
  pubkeys = []; // pubkeys[i] = hex pubkey of i-th person
  friends = []; // friends[i][0] and friends[i][1] is friend.
  userrelays  = []; // userrelays[i][r] is r-th relay name in which i-th person has their follow s.
  //get relay url from the form
  let str = form1.searchrelays.value;
  str = str.replace(/ */g  , ''  );
  str = str.replace(/\n\n/g, '\n');
  str = str.replace(/\n$/g , ''  );
  searchrelays = str.split("\n");
  nrelay = searchrelays.length;
  npubonrelay = new Array(nrelay);
  for(let i=0;i<nrelay;i++){
    nevents[i]=0;
    eoses[i]=false;
    npubonrelay[i]=0;
  }
  isskip = false; 
  await Promise.allSettled(searchrelays.map(async (url)=>{
    let relay;
    try{
      relay = await window.NostrTools.Relay.connect(url);
    }catch{
      console.log("error:relay.on for the relay "+url);
      return new Promise((resolve)=>{resolve([]);});
    }
    let isfinish = false;
    let lastevent = 0;
    do{
      let ri=searchrelays.indexOf(url);
      let limitr = Math.min(Math.floor(limit/nrelay-nevents[ri]), 500);
      let filter;
      if(lastevent==0){
        filter = [{"kinds":[3],"limit":limitr}];
      }else{
        filter = [{"until":lastevent,"kinds":[3],"limit":limitr}];
      }
      let nevent = 0;
      await new Promise(function(resolve){
        setTimeout(()=>{
          resolve();
        }, 3000);
        const sub = relay.subscribe(filter, {
          onevent:function(ev){
            if(isskip||isfinish){
              resolve();
              return;
            }
            nevent++;
            console.log("event "+nevent+" "+url);
            let ri=searchrelays.indexOf(url);
            if(ev.created_at<lastevent || lastevent==0){
              lastevent = ev.created_at;
            }
            if(ev.tags.length<minfollow){return;}
            nevents[ri]++;
            let a = pubkeys.number(npubEncode(ev.pubkey));
            addRelay(ri,a);
            let nb = ev.tags.length;
            for(let ib=0;ib<nb;ib++){
              let b = pubkeys.number(npubEncode(ev.tags[ib][1]));
              if(a<b){
                friends.push([a,b]);
              }else if(b<a){
                friends.push([b,a]);
              }else{
                //ignore self
              }
            }//for ib
            let limitperrelay = Math.floor(limit/nrelay);
            printstatus_relaycount("collecting users...",nevents, limitperrelay);
            if(nevents[ri] >= limitperrelay){
              isfinish = true;
              resolve();
            }
          },
          oneose:function(){
            console.log("eose "+nevent+" "+url);
            if(nevent==0){
              isfinish = true;
              eoses[ri]=true;
              sub.close();
              resolve();
            }
          }
        });
      });
    }while(!isfinish && !isskip);
    relay.close();
  }));
  //count npubonrelay
  npubonrelay = new Array(nrelay);
  for(let i=0;i<nrelay;i++){
    npubonrelay[i]=0;
  }
  for(let i=0;i<pubkeys.length;i++){
    if(userrelays[i]==undefined)continue;
    for(let j=0;j<userrelays[i].length;j++){
      npubonrelay[userrelays[i][j]]++;
    }
  }
}
const addRelay = function(ri,a){
  if(userrelays[a]==undefined){
    userrelays[a]=[];
  }
  if(userrelays[a].indexOf(ri)<0){
    userrelays[a].push(ri);
  }
}

let names;
const getProfile = async function(){
  for(let i=0;i<nrelay;i++){
    nevents[i]=0;
    eoses[i]=false;
  }
  isskip = false;
  printstatus("finding profiles...");
  await Promise.allSettled(searchrelays.map(async (url)=>{
    let relay;
    try{
      relay = await window.NostrTools.Relay.connect(url);
    }catch{
      console.log("error:relay.on for the relay "+url);
      return new Promise((resolve)=>{resolve([]);});
    }
    let isfinish = false;
    let lastevent = 0;
    names = new Array(pubkeys.length);
    for(let i=0;i<pubkeys.length;i++){
      names[i]="";
    }
    // correct kind:0
    do{
      let filter;
      if(lastevent==0){
        filter = [{"kinds":[0],"limit":500}];
      }else{
        filter = [{"until":lastevent,"kinds":[0],"limit":500}];
      }
      let nevent = 0;
      await (
        new Promise(
          function(resolve){
            setTimeout(()=>resolve(), 30000); //timeout
            const sub = relay.subscribe(filter, {
              onevent:function(ev){
                if(isskip||isfinish){
                  resolve();
                  return;
                }
                nevent++;
                //console.log("ev.created_at="+ev.created_at);
                if(ev.created_at<lastevent || lastevent==0){
                  lastevent = ev.created_at;
                }
                let name = JSON.parse(ev.content).name;
                let npub = window.NostrTools.nip19.npubEncode(ev.pubkey);
                let n = pubkeys.indexOf(npub);
                if(n>=0){
                  names[n]=name;
                  nevents[i]++;
                }
                printstatus_relaycount("finding profiles...", nevents, npubonrelay[i]);
                console.log("nevents["+i+"]="+nevents[i] + " / "+npubonrelay[i] + " "+searchrelays[i]);
              },
              oneose:function(){
                if(nevent==0){
                  eoses[i]=true;
                  sub.close();
                  resolve();
                }
              }
            });
          }
        )
      );
      
      if(nevent==0||pubkeys.length>=limit){
        isfinish = true;
      }
    }while(!isfinish);
    relay.close();
  }));

  for(let i=0;i<pubkeys.length;i++){
    if(names[i]==""){
      tmp=pubkeys[i];
      //sanitize html tag
      tmp=tmp.replace(/&/g,"&amp;");
      tmp=tmp.replace(/</g,"&lt;");
      tmp=tmp.replace(/>/g,"&gt;");
      names[i]=tmp;
    }
  }
}
let langs;
let langcolor;
const getLang = async function(){
  isskip = false;
  let progresses = new Array(searchrelays.length);
  for(let i=0;i<searchrelays.length;i++) progresses[i]=0;
  await Promise.allSettled(searchrelays.map(async function(url){
    let ri = searchrelays.indexOf(url);
    return new Promise(async function(resolverelay){
      let relay;
      try{
        relay = await window.NostrTools.Relay.connect(url);
      }catch{
        console.log("error:relay.on for the relay "+url);
        return new Promise((resolve)=>{resolve([]);});
      }
      let nnotetoget = 10;
      let isfinish = false;
      let npubkey = pubkeys.length;
      langs = new Array(pubkeys.length);
      for(let i=0;i<pubkeys.length;i++){
        langs[i]=[];
      }
      // correct kind:1
      for(let i=0;i<pubkeys.length;i++){
        progresses[ri]=i;
        if(userrelays[i]==undefined){
          continue;
        }
        console.log("i="+i+"/" + pubkeys.length+"url="+url+"start");
        let author = window.NostrTools.nip19.decode(pubkeys[i]).data;
        let filter = [{"kinds":[1],"authors":[author],"limit":nnotetoget}];
        await (new Promise(function(resolvesub){
          setTimeout(function(){resolvesub();}, 30000); //timeout
          const sub = relay.subscribe(filter, {
            onevent:function(ev){
              if(isskip||isfinish){
                resolvesub();
                return;
              }
              //console.log("ev.created_at="+ev.created_at);
              let content = ev.content;
              //remove html
              content = content.replace(/https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g,"");
              let lang = detectLanguage(content);
              langs[i].push(lang);
              printstatus_relaycount("finding languages...", progresses, pubkeys.length);
            },
            oneose:function(){
              eoses[i]=true;
              sub.close();
              resolvesub();
            }
          });
        }));
        console.log("i="+i+"/" + pubkeys.length+"url="+url+"end");
      }//for i
      relay.close();
      resolverelay();
    });//return new Promise(async function(resolverelay){
  }));//Promise.allSettled(searchrelays.map(async function(url){
  console.log("langs="+langs);
}

let isskip = false;
const skipsearch = function(){
  isskip = true;
}
//tsne-------------------
let A;
let color=[
  [255,0,0],
  [0,255,0],
  [0,0,255],
  [0,255,255],
  [255,0,255],
  [255,255,0],
  [0,127,255],
  [127,255,0],
  [255,0,127],
  [0,255,127],
];
let isTsneInit = false;
let tsne;
let is_data_digits = false;
let initTsne=async function(){
  let scale=5;
  gW = new Geom(2,[[-scale,-scale],[scale,scale]]);
  let D;
  if(is_data_digits){
    let N = digits.data.length;
    A = digits.target.slice(0,N-1); //use scikit
    D = TSNE.data2distances(digits.data.slice(0,N-1)); //use scikit
  }else{
    // count followers
    followers = new Array(pubkeys.length);
    for(let p=0;p<pubkeys.length;p++){
      followers[p]=0;
    }
    for(let p=0;p<pubkeys.length;p++){
      for(let i=0;i<friends.length;i++){
        if(friends[i][0]==p || friends[i][1]==p){
          followers[p]++;
        }
      }
    }
    // remove user with less than 10 followers and update pubkeys
    let pubkeys2 = [];
    let pubkeymap = new Array(pubkeys.length);
    for(let p=0;p<pubkeys.length;p++){
      if(followers[p]>=minfollow){
        pubkeys2.push(pubkeys[p]);
        pubkeymap[p]=pubkeys2.length-1;
      }
    }
    pubkeys = pubkeys2.clone();
    // remove user with less than 10 followers and update friends
    let friends2 = [];
    for(let i=0;i<friends.length;i++){
      let a = friends[i][0];
      let b = friends[i][1];
      if(followers[a]>=minfollow && followers[b]>=minfollow){
        friends2.push([pubkeymap[a],pubkeymap[b]]);
      }
    }
    friends = friends2.clone();

    /* friends2[i][2] to D[i][j] */
    let N = pubkeys.length;
    D = new Array(N);
    for(let i=0;i<N;i++){
      D[i]=new Array(N);
      for(let j=0;j<N;j++){
        D[i][j]=10000;
      }
    }
    for(let i=0;i<friends.length;i++){
      let a = friends[i][0];
      let b = friends[i][1];
      D[a][b]=1;
      D[b][a]=1;
    }
  }
  tsne=new TSNE(D, 2);
  isTsneInit = true;
  
  //performance counter
  elapsehist=new Array(10);
  for(let i=0;i<elapsehist.length;i++){
    elapsehist[i]=frameInterval;
  }
};
let movfilter;
let procTsne=function(){
  let t0=(new Date).getTime()/1000;
  tsne.step();
  let t1=(new Date).getTime()/1000;
  let dt = t1-t0;
  elapsehist.shift();
  elapsehist.push(dt);
  let mean=elapsehist.mean();
  frameInterval = [mean/targetLoad, frameIntervalMin].max();
  document.getElementById("debug").innerHTML=
    "this frame: "+Math.floor(dt  *1000)+" [ms] "+
    "/average   : "+Math.floor(mean*1000)+" [ms] "+
    "/frame rate: "+Math.floor(1/frameInterval*100)/100+ " [fps]";
  isRequestedDraw = true;
}
//game loop ------------------
let procAll=function(){
  procEvent();
  procTsne();
  if(isRequestedDraw){
    procDraw();
    isRequestedDraw = false;
  }
}
let initHtml=function(){
  //debug = document.getElementById('debug');
  if(navigator.language=='ja'){
  }
}

// html ----------------------------
let debug;
window.onresize = function(){ //browser resize
  let agent = navigator.userAgent;
  let wx= [(document.documentElement.clientWidth - 20)*0.98, 320].max();
  let wy= [(document.documentElement.clientHeight-300)     ,  20].max();
  document.getElementById("outcanvas").width = wx;
  document.getElementById("outcanvas").height= wy;
  renewgS();
  isRequestedDraw = true;
};
// graphics ------------------------
let can;
let ctx;
let gS;
let fontsize = 15;
let radius = 15;
let isRequestedDraw = true;
let isSheetLoaded = false;
let frameInterval    = 0.5;  //[sec]
let frameIntervalMin = 0.25; //[sec]
let targetLoad = 0.8; //1.0=100%
//init
let initDraw=function(){
  can = document.getElementById("outcanvas");
  ctx = can.getContext('2d');
  renewgS();
}
let renewgS=function(){
  if(can){
    let minwidth = [can.height, can.width].min();
    let s=[[0,minwidth],[minwidth,0]];
    gS = new Geom(2,s);
  }
}
//proc
let procDraw = function(){

  //background
  ctx.fillStyle="white";
  ctx.fillRect(0,0,can.width, can.height);

  //grid line -----------------------
  //get screen in world coordinate
  let scr = [transPos([0,can.height], gS, gW), transPos([can.width,0], gS, gW)];
  let base=8;
  let L=Math.log10(scr[1][0]-scr[0][0])/Math.log10(base);
  let intL=Math.floor(L);
  let fracL=L-intL;
  intL =Math.pow(base,intL);
  fracL=Math.pow(base,fracL)/base;
  let depths = 3;
  //debug.innerHTML = "intL="+intL+"\n";
  //debug.innerHTML += "fracL="+fracL+"\n";
  for(let depth=depths-1;depth>=0;depth--){
    let qw = intL/Math.pow(base,depth);
    let c = Math.floor(((depth+fracL)/depths)*64+64+127);
    //debug.innerHTML += "c("+depth+") = "+c+"\n";
    ctx.lineWidth=1;
    ctx.strokeStyle='rgb('+c+','+c+','+c+')';
    for(let d=0;d<gW.dims;d++){
      let q0 = Math.floor((scr[0][d])/qw)*qw;
      let q1 = Math.ceil ((scr[1][d])/qw)*qw;

      for(let q=q0;q<q1;q+=qw){
        let wq = scr.clone();
        wq[0][d]=q;
        wq[1][d]=q;
        let sq = [transPosInt(wq[0],gW,gS), transPosInt(wq[1],gW,gS)];
        ctx.beginPath();
        ctx.moveTo(sq[0][0],sq[0][1]);
        ctx.lineTo(sq[1][0],sq[1][1]);
        ctx.stroke();
      }//q
    }//depth
  }//d

  if(isTsneInit){
    //Y nodes
    N=tsne.N;
    sY=new Array(N);
    Y=tsne.Y;
    for(let n=0;n<N;n++){
      sY[n]=transPosInt(Y[n],gW,gS);
    }
    ctx.lineWidth=0;
    for(let n=0;n<N;n++){
      if(is_data_digits){
        ctx.fillStyle='rgb('+color[A[n]][0]+','+color[A[n]][1]+','+color[A[n]][2]+')';
      }else{
        ctx.fillStyle='rgb(0,0,0)';
      }
      ctx.beginPath();
      ctx.arc(sY[n][0], sY[n][1], 2, 0, 2*Math.PI);
      ctx.fill();
    }
    // find nearest node with downpos
    if(downpos[0]!=undefined){
      if(seluser_renewed){
        seluser = -1;
        seluser_d = 1000000;
        for(let n=0;n<N;n++){
          let d = (Y[n][0]-downpos[0])*(Y[n][0]-downpos[0])+(Y[n][1]-downpos[1])*(Y[n][1]-downpos[1]);
          if(d<seluser_d){
            seluser  =n;
            seluser_d=d;
          }
        }
        let relaystr = "";
        if(userrelays[seluser]!=undefined){
          for(let i=0;i<userrelays[seluser].length;i++){
            relaystr += searchrelays[userrelays[seluser][i]]+" ";
          }
        }
        document.getElementById("selecteduserlink").innerHTML=
          "selected username = <a href='https://nostter.app/"+pubkeys[seluser]+"' target='_blank'>"+names[seluser]+"</a> on relay "+relaystr;
      }
      if(seluser>=0){
        ctx.StrokeStyle='rgb(255,0,0)';
        ctx.beginPath();
        ctx.arc(sY[seluser][0], sY[seluser][1], radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fillStyle='rgb(0,0,255)';
        ctx.fillText(names[seluser], sY[seluser][0]+radius, sY[seluser][1]+radius);
        seluser_renewed = false;
      }
    }//downpos is valid
  }
}
//event---------------------
let downpos=[undefined,undefined];// while mouse down
let seluser_renewed = false;
let movpos =[-1,-1];// while drag
let seluser_d = 1000000;
let seluser = -1;
let handleMouseDown = function(){
  downpos = transPos(mouseDownPos,gS,gW);
  movpos[0] = downpos[0];
  movpos[1] = downpos[1];
  seluser_renewed = true;

}
let handleMouseDragging = function(){
  movpos = transPos(mousePos,gS,gW);
  for(let i=0;i<2;i++){
    for(let d=0;d<2;d++){
      gW.w[i][d] -= movpos[d]-downpos[d];
    }
  }
  isRequestedDraw = true;
}
let handleMouseUp = function(){
  isRequestedDraw = true;
}
let handleMouseWheel = function(){ //zoom in/out
  let pos=transPos(mousePos,gS,gW);
  let oldw=gW.w.clone();
  for(let i=0;i<2;i++){
    for(let d=0;d<2;d++){
      gW.w[i][d] = (oldw[i][d]-pos[d])*Math.pow(1.1, -mouseWheel[1]/200)+pos[d];
    }
  }
  gW.recalc();
  isRequestedDraw = true;
}
let zoom = function(value){ // value=+1:zoom in, value=-1:zoom out
  let pos;
  if(downpos[0]!=undefined){
    //zoom by last mouse down position
    pos = downpos.clone();
  }else{
    //zoom by center
    let wx = document.getElementById("outcanvas").width;
    let wy = document.getElementById("outcanvas").height;
    spos = [wx/2,wy/2];
    pos = transPos(spos,gS,gW);
  }
  let oldw=gW.w.clone();
  for(let i=0;i<2;i++){
    for(let d=0;d<2;d++){
      gW.w[i][d] = (oldw[i][d]-pos[d])*Math.pow(1.1, -value*5)+pos[d];
    }
  }
  gW.recalc();
  isRequestedDraw = true;
}

