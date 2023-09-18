/* implementation of 
 * Laurens van der Maaten, Geoffrey Hinton, ”Visualizing Data using t-SNE”, Journal of Machine Learning Research (2008) pp.1-48
 * http://www.cs.toronto.edu/~hinton/absps/tsne.pdf
*/
var TSNE=function(X, ndimY){
  this.init(X, ndimY);
}
TSNE.prototype.init=function(D, ndimY){
  this.D = D;
  this.N=this.D.length;

  this.ndimY = ndimY;
  this.Y=new Array(N);
  this.iter=0;
  this.param = {perpth:30, eta:100, alpha:0.5, maxiter:100};

  //box-muller method
  var N=this.N;
  for(var n=0;n<N;n++){
    this.Y[n]=new Float64Array(this.ndimY);
    a = Math.sqrt(-2*Math.log(Math.random()));
    t = Math.random()*2*Math.PI;
    this.Y[n][0] = a*Math.cos(t);
    this.Y[n][1] = a*Math.sin(t);
  }

  //init P
  var th      = this.param.perpth;
  var maxiter = 100;
  var tol     = 1e-3;
  var condP  = new Array(N); // p_{j|i}
  var perpPi = new Array(N); // perp(P_i)
  for(var i=0;i<N;i++){

    //sigma iteration
    var lb = Number.NEGATIVE_INFINITY;
    var ub = Number.POSITIVE_INFINITY;
    var sigma = 1.0;
    var issearching = true;
    condP[i] = new Float64Array(N);

    for(it=0;it<maxiter&&issearching;it++){
      // try to calculate P_{j|i}=condP[i][j] by sigma
      //eq(1)
      //P{j|i}=           exp(-|X[i]-X[j]|^2/(2sigma^2))
      //        /sum[k!=l]exp(-|X[k]-X[l]|^2/(2sigma^2))
      var sum = 0.0;
      for(var j=0;j<N;j++){
        if(i===j){
          condP[i][j]  = 0.0;
        }else{
          var pj   = Math.exp(-D[i][j]/(2.0*sigma));
          condP[i][j]  = pj;
          sum     += pj;
        }
      }
      for(var j=0;j<N;j++){
        condP[i][j] /= sum;
      }

      // evaluate it by perp(condP[i]) 
      //eq(4)(5)
      //perp(condP[i]) = 2^H(condP[i])
      //H(condP[i])    = -sum[j]condP[i][j]log_2(condP[i][j])
      var Hpi = 0.0;
      for(var j=0;j<N;j++){
        if(i!==j){
          var p=condP[i][j];
          Hpi -= p > 1e-7 ? p*Math.log(p):0.0;
        }
      }
      var perpPi = 2**Hpi;
      if(perpPi < th){
        lb    = sigma;
        sigma = ub===Number.POSITIVE_INFINITY ? sigma*2:(sigma+ub)/2;
      }else{
        ub    = sigma;
        sigma = lb===Number.NEGATIVE_INFINITY ? sigma/2:(sigma+lb)/2;
      }
      if(Math.abs(th-perpPi) < tol){
        issearching = false;
        //console.log("sigma["+i+"]="+sigma);
      }
    }//for it
  }//for i
  
  //convert p_{j|i} into p+{ij}
  var inv2N = 1.0/(2.0*N); // 1/(2N)
  var P = new Array(N); //p_{ij}
  for(var i=0;i<N;i++){
    P[i] = new Float64Array(N);
    for(var j=0;j<N;j++){
      if(i!==j){
        P[i][j] = (condP[i][j] + condP[j][i])*inv2N;
      }
    }
  }
  this.P = P;
}// init

TSNE.prototype.step = function(){
  var N = this.N;
  var P = this.P;
  var Y = this.Y;
  var ndimY = Y[0].length;
  var newY = Y.clone();

  // eq (12)
  // Q[i][j]   =(1+|Y[i]-Y[j]|^2)^{-1}
  //  /sum[k!=l](1+|Y[k]-Y[l]|^2)^{-1}
  var sum = 0.0;
  for(var k=0;k<N;k++){
    for(var l=0;l<N;l++){
      if (k!==l) {
        var l2=0.0;
        for(var d=0;d<ndimY;d++){
          var dY = Y[k][d]-Y[l][d];
          l2    += dY * dY;
        }
        sum += 1.0/(1.0 + l2);
      }
    }
  }
  var Q = new Array(N);
  for (var i=0;i<N;i++) {
    Q[i] = new Float64Array(N);
    for (var j=0;j<N;j++) {
      if (i!==j) {
        // Student t-distribution
        var l2=0.0;
        for(var d=0;d<ndimY;d++){
          var dY = Y[i][d]-Y[j][d];
          l2    += dY * dY;
        }
        Q[i][j] = 1.0/(1.0 + l2);
        Q[i][j] /= sum;
      }// if i!=j
    }// for j
  }//for i
  
  //eq(13)
  //dC/dY[i] = 4sum[j]{(P[i][j]-Q[i][j])(Y[i]-Y[j])(1+|Y[i]-Y[j]|^2)^{-1}}
  var cost = 0.0;
  var dcdy = new Array(N);
  for(var i=0;i<N;i++){
    dcdy[i] = new Float64Array(ndimY);
    dcdy[i][j]=0.0;
  }
  for(var i=0;i<N;i++){
    for(var j=0;j<N;j++){
      if(i!=j){
        var pij = P[i][j];
        var qij = Q[i][j];
        cost += pij * Math.log(pij/qij);
        var l2=0.0;
        for(var d=0;d<ndimY;d++){
          var dY = Y[i][d]-Y[j][d];
          l2    += dY * dY;
        }
        var a = (pij-qij)*(1.0/(1.0+l2));
        for(var d=0;d<ndimY;d++){
          dcdy[i][d] += 4.0*a*(Y[i][d]-Y[j][d]);
          //console.log("dcdy["+i+"]["+d+"].["+j+"] += "+ 4.0*a*(Y[i][d]-Y[j][d]));
        }//for d
      }//if i!=j
    }// for j
  }// for i

  //eq(7)
  //Y[i](t) = Y[i](t-1) + dcdY[i] + alpha(t)(Y[i](t-1)-Y[j](t-2))
  eta   = this.param.eta;
  alpha = this.param.alpha;
  step  = new Array(N);
  newY  = new Array(N);
  meanY = new Array(N);
  for(var i=0;i<N;i++){
    step [i] = new Float64Array(ndimY);
    newY [i] = new Float64Array(ndimY);
    for(d=0;d<ndimY;d++){
      step[i][d] = alpha * step[i][d] - eta*dcdy[i][d];
      newY[i][d] = Y[i][d] + step[i][d];
      meanY[d]  += newY[i][d];
    }
  }

  //normalize positions
  sumY = new Float64Array(ndimY);
  for(var i=0;i<N;i++){
    for(var d=0;d<ndimY;d++){
      sumY[d] += newY[i][d];
    }
  }
  var invN = 1/N;
  for(var i=0;i<N;i++){
    for(var d=0;d<ndimY;d++){
      this.Y[i][d] = newY[i][d] - sumY[d]*invN;
    }
  }
}
TSNE.data2distances=function(X){
  //D[i][j]=|X[i]-X[j]|^2
  var N = X.length;
  var ndimX = X[0].length;
  var D = new Array(N);
  for(var i=0;i<N;i++) D[i] = new Float64Array(N);
  for(var i=0;i<N;i++){
    for(var j=0;j<N;j++){
      D[i][j]=0;
      for(var d=0;d<ndimX;d++){
        var dX = X[i][d]-X[j][d];
        D[i][j] += dX*dX;
      }
    }
  }
  return D;
}

