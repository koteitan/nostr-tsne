// nostr-------------------
var isRelayLoaded = false;
// fields--------------------
var gW; /* world coordinate */
//entry point--------------------
var printstatus=function(str){
  document.getElementById("debug").innerHTML=str;
}

window.onload = async function(){
  initHtml();

  printstatus("initialize nostr...");
  await initNostr();

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
var relayurl="wss://yabu.me";
var relay;
var pubpool;
var friendlist;
var initNostr = async function(){
  relay = window.NostrTools.relayInit(relayurl);
  relay.on("error",()=>{console.log("error:relay.on for the relay "+relayurl);});
  await relay.connect();

  var filter = [{"kinds":[3],"limit":100}];
  sub = relay.sub(filter);
  pubkeylist = []; // pubkeylist[i] = hex pubkey of i-th person
  friendlist = []; // friendlist[i][0] and friendlist[i][1] is friend.
  printstatus("initializing nostr...analysing "+pubkeylist.length+" followers in the relay...");
  await (async ()=>{
    return new Promise((resolve)=>{
      setTimeout(()=>resolve(), 5000); //timeout
      sub.on("event",(ev)=>{
        var a = pubkeylist.number(ev.pubkey);
        var nb = ev.tags.length;
        for(var ib=0;ib<nb;ib++){
          var b = pubkeylist.number(ev.tags[ib][1]);
          if(a<b){
            friendlist.push([a,b]);
          }else if(b<a){
            friendlist.push([b,a]);
          }
        }//for ib
        printstatus("initializing nostr...analysing "+pubkeylist.length+" followers in the relay...");
      });//sub.on("event",(ev)=>{
      sub.on("eose",()=>{resolve();});
    });//Promise(()=>{
  })();//await(async()=>{
  console.log("hey");
}
//tsne-------------------
var A;
var color=[
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
var isTsneInit = false;
var tsne;
var initTsne=async function(){
  var scale=5;
  gW = new Geom(2,[[-scale,-scale],[scale,scale]]);
  var N = digits.data.length;
  A=digits.target.slice(0,N-1); //use scikit
  var D = TSNE.data2distances(digits.data.slice(0,N-1)); //use scikit
  tsne=new TSNE(D, 2);
  isTsneInit = true;

  //performance counter
  elapsehist=new Array(10);
  for(var i=0;i<elapsehist.length;i++){
    elapsehist[i]=frameInterval;
  }
};
var movfilter;
var procTsne=function(){
  var t0=(new Date).getTime()/1000;
  tsne.step();
  var t1=(new Date).getTime()/1000;
  var dt = t1-t0;
  elapsehist.shift();
  elapsehist.push(dt);
  var mean=elapsehist.mean();
  frameInterval = [mean/targetLoad, frameIntervalMin].max();
  document.getElementById("debug").innerHTML=
    "this frame: "+Math.floor(dt  *1000)+" [ms] "+
    "/average   : "+Math.floor(mean*1000)+" [ms] "+
    "/frame rate: "+Math.floor(1/frameInterval*100)/100+ " [fps]";
  isRequestedDraw = true;
}
//game loop ------------------
var procAll=function(){
  procEvent();
  procTsne();
  if(isRequestedDraw){
    procDraw();
    isRequestedDraw = false;
  }
}
var initHtml=function(){
  //debug = document.getElementById('debug');
  if(navigator.language=='ja'){
  }
}

// html ----------------------------
var debug;
window.onresize = function(){ //browser resize
  var wx,wy;
  var agent = navigator.userAgent;
  var wx= [(document.documentElement.clientWidth - 20)*0.98, 320].max();
  var wy= [(document.documentElement.clientHeight-250)     ,  20].max();
  document.getElementById("outcanvas").width = wx;
  document.getElementById("outcanvas").height= wy;
  renewgS();
  isRequestedDraw = true;
};
// graphics ------------------------
var ctx;
var can;
var gS;
var fontsize = 15;
var radius = 15;
var isRequestedDraw = true;
var isSheetLoaded = false;
var frameInterval    = 0.5;  //[sec]
var frameIntervalMin = 0.25; //[sec]
var targetLoad = 0.8; //1.0=100%
//init
var initDraw=function(){
  can = document.getElementById("outcanvas");
  ctx = can.getContext('2d');
  renewgS();
}
var renewgS=function(){
  var minwidth = [can.height, can.width].min();
  var s=[[0,minwidth],[minwidth,0]];
  gS = new Geom(2,s);
}
//proc
var procDraw = function(){

  //background
  ctx.fillStyle="white";
  ctx.fillRect(0,0,can.width, can.height);

  //grid line -----------------------
  //get screen in world coordinate
  var scr = [transPos([0,can.height], gS, gW), transPos([can.width,0], gS, gW)];
  var base=8;
  var L=Math.log10(scr[1][0]-scr[0][0])/Math.log10(base);
  var intL=Math.floor(L);
  var fracL=L-intL;
  var intL =Math.pow(base,intL);
  var fracL=Math.pow(base,fracL)/base;
  var depths = 3;
  //debug.innerHTML = "intL="+intL+"\n";
  //debug.innerHTML += "fracL="+fracL+"\n";
  for(var depth=depths-1;depth>=0;depth--){
    var qw = intL/Math.pow(base,depth);
    var c = Math.floor(((depth+fracL)/depths)*64+64+127);
    //debug.innerHTML += "c("+depth+") = "+c+"\n";
    ctx.lineWidth=1;
    ctx.strokeStyle='rgb('+c+','+c+','+c+')';
    for(var d=0;d<gW.dims;d++){
      var q0 = Math.floor((scr[0][d])/qw)*qw;
      var q1 = Math.ceil ((scr[1][d])/qw)*qw;

      for(var q=q0;q<q1;q+=qw){
        var wq = scr.clone();
        wq[0][d]=q;
        wq[1][d]=q;
        var sq = [transPosInt(wq[0],gW,gS), transPosInt(wq[1],gW,gS)];
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
    for(var n=0;n<N;n++){
      sY[n]=transPosInt(tsne.Y[n],gW,gS);
    }
    ctx.lineWidth=0;
    for(var n=0;n<N;n++){
      ctx.fillStyle='rgb('+color[A[n]][0]+','+color[A[n]][1]+','+color[A[n]][2]+')';
      ctx.beginPath();
      ctx.arc(sY[n][0], sY[n][1], 2, 0, 2*Math.PI);
      ctx.fill();
    }
  }
}
//event---------------------
var downpos=[-1,-1];// start of drag
var movpos =[-1,-1];// while drag
var handleMouseDown = function(){
  downpos = transPos(mouseDownPos,gS,gW);
  movpos[0] = downpos[0];
  movpos[1] = downpos[1];
}
var handleMouseDragging = function(){
  movpos = transPos(mousePos,gS,gW);
  for(var i=0;i<2;i++){
    for(var d=0;d<2;d++){
      gW.w[i][d] -= movpos[d]-downpos[d];
    }
  }
  isRequestedDraw = true;
}
var handleMouseUp = function(){
  isRequestedDraw = true;
}
var handleMouseWheel = function(){
  var pos=transPos(mousePos,gS,gW);
  var oldw=gW.w.clone();
  for(var i=0;i<2;i++){
    for(var d=0;d<2;d++){
      gW.w[i][d] = (oldw[i][d]-pos[d])*Math.pow(1.1, -mouseWheel[1]/200)+pos[d];
    }
  }
  gW.recalc();
  isRequestedDraw = true;
}
