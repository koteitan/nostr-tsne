// nostr-------------------
let isRelayLoaded = false;
// fields--------------------
let gW; /* world coordinate */
//entry point--------------------
let printstatus=function(str){
  document.getElementById("debug").innerHTML=str;
}
const printstatus_relaycount=function(relayEventCount, limitperrelay){
  let str = "initializing nostr...<br>";
  for(let i=0;i<nrelay;i++){
    str+=neventlist[i]+" / "+ limitperrelay +" users in the relay "+ relayurl[i];
    if(eoselist[i]){
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
    printstatus("initialize nostr...");
    await initNostr();
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
      let list = await get_my_relay(kind);
      form1.relayurl.value = "";
      for(relay of list){
        form1.relayurl.value += relay + "\n";
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
  let relaylist = Object.keys(bsrelay);
  let filter = [{"kinds":[kind],"authors":[await window.nostr.getPublicKey()]}];
  let resultlist = await Promise.allSettled(relaylist.map(async (url)=>{
    let result = [];

    await Promise.race([new Promise(async (resolve, reject)=>{
      let relay = window.NostrTools.relayInit(url);
      relay.on("error",()=>{
        reject();
      });
      try{
        await relay.connect();
        sub = relay.sub(filter);
        resolve();
      }catch{
        return new Promise((resolve)=>{resolve([]);});
      }
    }),new Promise((resolve,reject)=>{
      setTimeout(reject, 1000);
    })]).catch(err=>{return new Promise((resolve)=>{resolve([]);});});

    return new Promise((resolve)=>{
      setTimeout(()=>resolve(result), 3000);
      sub.on("event",(ev)=>{
        if(kind==3){
          result.push({
            time     :ev.created_at,
            relaylist:Object.keys(JSON.parse(ev.content)),
            origin   :url,
          });
        }else if(kind==10002){
          let rl=[];
          for(t of ev.tags){
            rl.push(t[1]);
          }
          result.push({
            time     :ev.created_at,
            relaylist:rl,
            origin   :url,
          });
        }
      });
      sub.on("eose",()=>{
        console.log("found:"+url);
        resolve(result);
      });
    });
  })).then(results=>{
    console.log("debug:-------");
    latest = {time:0, relaylist:[]};
    for(r1 of results){
      if(r1.status=='rejected')continue;
      for(r2 of r1.value){
        if(r2.time > latest.time){
          latest = r2;
        }
      }
    }
    return latest.relaylist;
  });
  return resultlist;
}
let relayurl;
let nrelay;
let pubpool;
let friendlist;
let namelist;
let relaylist = [];
let neventlist = [];
let eoselist = [];
let followerlist;
let npubEncode = window.NostrTools.nip19.npubEncode;

const initNostr = async function(){
  pubkeylist = []; // pubkeylist[i] = hex pubkey of i-th person
  friendlist = []; // friendlist[i][0] and friendlist[i][1] is friend.
  //get relay url from the form
  relayurlstr = form1.relayurl.value;
  relayurlstr = relayurlstr.replace(/ */g, '');
  relayurlstr = relayurlstr.replace(/\n\n/g, '\n');
  relayurlstr = relayurlstr.replace(/\n$/g, '');
  relayurl = relayurlstr.split("\n");
  nrelay = relayurl.length;
  for(let i=0;i<nrelay;i++){
    neventlist[i]=0;
    eoselist[i]=false;
  }
 
  await Promise.allSettled(relayurl.map(async (url)=>{
    let relay = window.NostrTools.relayInit(url);
    relay.on("error",()=>{console.log("error:relay.on for the relay "+url);});
    await relay.connect();
    let isfinish = false;
    let lastevent = 0;
    do{
      let ri=relayurl.indexOf(url);
      let limitr = Math.min(Math.floor(limit/nrelay-neventlist[ri]), 500);
      let filter;
      if(lastevent==0){
        filter = [{"kinds":[3],"limit":limitr}];
      }else{
        filter = [{"until":lastevent,"kinds":[3],"limit":limitr}];
      }
      sub = relay.sub(filter);
      let events = 0;
      await (async ()=>{
        return new Promise((resolve)=>{
          console.log("start on "+url);
          sub.on("event",(ev)=>{
            if(isskip){
              resolve();
              return;
            }
            let ri=relayurl.indexOf(url);
            events++;
            if(ev.created_at<lastevent || lastevent==0){
              lastevent = ev.created_at;
            }
            if(ev.tags.length<minfollow){return;}
            neventlist[ri]++;
            let a = pubkeylist.number(npubEncode(ev.pubkey));
            addRelay(ri,a);
            let nb = ev.tags.length;
            for(let ib=0;ib<nb;ib++){
              let b = pubkeylist.number(npubEncode(ev.tags[ib][1]));
              if(a<b){
                friendlist.push([a,b]);
              }else if(b<a){
                friendlist.push([b,a]);
              }else{
                //ignore self
              }
            }//for ib
            let limitperrelay = Math.floor(limit/nrelay);
            printstatus_relaycount(neventlist[ri], limitperrelay);
            if(neventlist[ri] >= limitperrelay){
              resolve();
            }
          });//sub.on("event",(ev)=>{
          sub.on("eose",()=>{
            eoselist[ri]=true;
            resolve();
          });
        });//Promise(()=>{
      })();//await(async()=>{
      if(events==0 || neventlist[ri]>= limitperrelay){
        isfinish = true;
      }
    }while(!isskip && !isfinish);
    sub.unsub();
    relay.close();
  }));

  form1.skipbutton.disabled = true;
  console.log("getProfile");
  await getProfile();

  for(let i=0;i<pubkeylist.length;i++){
    if(namelist[i]==""){
      tmp=pubkeylist[i];
      //sanitize html tag
      tmp=tmp.replace(/&/g,"&amp;");
      tmp=tmp.replace(/</g,"&lt;");
      tmp=tmp.replace(/>/g,"&gt;");
      namelist[i]=tmp;
    }
  }
}
const addRelay = function(ri,a){
  if(relaylist[a]==undefined){
    relaylist[a]=[];
  }
  if(relaylist[a].indexOf(ri)<0){
    relaylist[a].push(ri);
  }
}
const getProfile = async function(){
  relay = window.NostrTools.relayInit(relayurl[0]);
  relay.on("error",()=>{console.log("error:relay.on for the relay "+relayurl[0]);});
  await relay.connect();
  let nnamegot = 0;
  let nevent = 0;
  let isfinish = false;
  let lastevent = 0;
  namelist = new Array(pubkeylist.length);
  for(let i=0;i<pubkeylist.length;i++){
    namelist[i]="";
  }
  // correct kind:0
  do{
    let filter;
    if(lastevent==0){
      filter = [{"kinds":[0],"limit":500}];
    }else{
      filter = [{"until":lastevent,"kinds":[0],"limit":500}];
    }
    sub = relay.sub(filter);
    let events = 0;
    await (async ()=>{
      return new Promise((resolve)=>{
        setTimeout(()=>resolve(), 30000); //timeout
        sub.on("event",(ev)=>{
          events++;
          //console.log("ev.created_at="+ev.created_at);
          if(ev.created_at<lastevent || lastevent==0){
            lastevent = ev.created_at;
          }
          let name = JSON.parse(ev.content).name;
          let npub = window.NostrTools.nip19.npubEncode(ev.pubkey);
          let n = pubkeylist.indexOf(npub);
          if(n>=0){
            namelist[n]=name;
            nnamegot++;
          }
          printstatus("getting profile..."+nnamegot+" / "+events+" kind:0 events in the relay...");
        });//sub.on("event",(ev)=>{
        sub.on("eose",()=>{
          //console.log("eose");
          //console.log("lastevent="+lastevent);
          resolve();
        });
      });//Promise(()=>{
    })();//await(async()=>{
    if(events==0||pubkeylist.length>=limit){
      isfinish = true;
    }
  }while(!isfinish);
  sub.unsub();
  relay.close();
}
let isskip = false;
const skipcollection = function(){
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
    followerlist = new Array(pubkeylist.length);
    for(let p=0;p<pubkeylist.length;p++){
      followerlist[p]=0;
    }
    for(let p=0;p<pubkeylist.length;p++){
      for(let i=0;i<friendlist.length;i++){
        if(friendlist[i][0]==p || friendlist[i][1]==p){
          followerlist[p]++;
        }
      }
    }
    // remove user with less than 10 followers and update pubkeylist
    let pubkeylist2 = [];
    let pubkeymap = new Array(pubkeylist.length);
    for(let p=0;p<pubkeylist.length;p++){
      if(followerlist[p]>=minfollow){
        pubkeylist2.push(pubkeylist[p]);
        pubkeymap[p]=pubkeylist2.length-1;
      }
    }
    pubkeylist = pubkeylist2.clone();
    // remove user with less than 10 followers and update friendlist
    let friendlist2 = [];
    for(let i=0;i<friendlist.length;i++){
      let a = friendlist[i][0];
      let b = friendlist[i][1];
      if(followerlist[a]>=minfollow && followerlist[b]>=minfollow){
        friendlist2.push([pubkeymap[a],pubkeymap[b]]);
      }
    }
    friendlist = friendlist2.clone();

    /* friendlist2[i][2] to D[i][j] */
    let N = pubkeylist.length;
    D = new Array(N);
    for(let i=0;i<N;i++){
      D[i]=new Array(N);
      for(let j=0;j<N;j++){
        D[i][j]=10000;
      }
    }
    for(let i=0;i<friendlist.length;i++){
      let a = friendlist[i][0];
      let b = friendlist[i][1];
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
let ctx;
let can;
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
  let minwidth = [can.height, can.width].min();
  let s=[[0,minwidth],[minwidth,0]];
  gS = new Geom(2,s);
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
        if(relaylist[seluser]!=undefined){
          for(let i=0;i<relaylist[seluser].length;i++){
            relaystr += relayurl[relaylist[seluser][i]]+" ";
          }
        }
        document.getElementById("selecteduserlink").innerHTML=
          "selected username = <a href='https://nostter.app/"+pubkeylist[seluser]+"' target='_blank'>"+namelist[seluser]+"</a> on relay "+relaystr;
      }
      if(seluser>=0){
        ctx.StrokeStyle='rgb(255,0,0)';
        ctx.beginPath();
        ctx.arc(sY[seluser][0], sY[seluser][1], radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fillStyle='rgb(0,0,255)';
        ctx.fillText(namelist[seluser], sY[seluser][0]+radius, sY[seluser][1]+radius);
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

