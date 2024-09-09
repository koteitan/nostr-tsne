// nostr-------------------
//let relayurl="wss://yabu.me";
let relayurl="wss://relay.damus.io"; /* relay to be analysed */
let limit     = 20000; /* max number of pubkeys */
let minfollow = 30;    /* analysed users limitation by the number of follower */
let isRelayLoaded = false;
// fields--------------------
let gW; /* world coordinate */
//entry point--------------------
let printstatus=function(str){
  document.getElementById("debug").innerHTML=str;
}

window.onload = async function(){
  initHtml();

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
  window.onresize(); //after loading maps
  setInterval(procAll, 0); //enter gameloop
}
//nostr------------------
let relay;
let pubpool;
let friendlist;
let followerlist;
let initNostr = async function(){
  relay = window.NostrTools.relayInit(relayurl);
  relay.on("error",()=>{console.log("error:relay.on for the relay "+relayurl);});
  await relay.connect();
  let isfinish = false;
  let lastevent = 0;
  pubkeylist = []; // pubkeylist[i] = hex pubkey of i-th person
  friendlist = []; // friendlist[i][0] and friendlist[i][1] is friend.
  do{
    let filter;
    if(lastevent==0){
      filter = [{"kinds":[3],"limit":500}];
    }else{
      filter = [{"until":lastevent,"kinds":[3],"limit":500}];
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
          if(ev.tags.length<minfollow){return;}
          let a = pubkeylist.number(ev.pubkey);
          let nb = ev.tags.length;
          for(let ib=0;ib<nb;ib++){
            let b = pubkeylist.number(ev.tags[ib][1]);
            if(a<b){
              friendlist.push([a,b]);
            }else if(b<a){
              friendlist.push([b,a]);
            }else{
              //ignore self
            }
          }//for ib
          printstatus("initializing nostr...analysing "+pubkeylist.length+" followers in the relay...");
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
        D[i][j]=0;
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
  let wy= [(document.documentElement.clientHeight-250)     ,  20].max();
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
    for(let n=0;n<N;n++){
      sY[n]=transPosInt(tsne.Y[n],gW,gS);
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
  }
}
//event---------------------
let downpos=[-1,-1];// start of drag
let movpos =[-1,-1];// while drag
let handleMouseDown = function(){
  downpos = transPos(mouseDownPos,gS,gW);
  movpos[0] = downpos[0];
  movpos[1] = downpos[1];
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
let handleMouseWheel = function(){
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
