//=========================================
// geom.js
//=========================================
/* require tag below:
  <script type="text/javascript" src="./matrix.js"></script>
  <script type="text/javascript" src="./geom.js"></script>
*/
/*---------------------------------------
Geom(_dims, _w[][])
_dims  = ������
_w[][] = ���W���E w[0][d] to w[1][d], d=����
-----------------------------------------*/
var Geom = function(_dims, _w){
  this.w = _w;
  this.dims = _dims;
  this.ww = new Array(this.dims);
  this.iww = new Array(this.dims);
  for(var d=0;d<this.dims;d++){
    this.ww[d] = this.w[1][d] - this.w[0][d];
    this.iww[d] = 1/this.ww[d];
  }
};
/* recalc */
Geom.prototype.recalc = function(){
  for(var d=0;d<this.dims;d++){
    this.ww[d] = this.w[1][d] - this.w[0][d];
    this.iww[d] = 1/this.ww[d];
  }
};
/*---------------------------------------
Camera(_dims, _w[][])
_dims  = ������
_w[][] = ���W���E w[0][d] to w[1][d], d=����
-----------------------------------------*/
var Camera = function(_pos, _dirmz, _dirx, _screenDistance){
  if(_pos != undefined){
    this.pos   = _pos;
    this.dirmz = _dirmz;
    this.dirx  = _dirx;
    this.screenDistance  = _screenDistance;
  }else{
    this.pos   = [0,0, 7];
    this.dirmz = [0,0,-1];
    this.dirx  = [1,0, 0];
    this.screenDistance  = -1;
  }
};
Camera.prototype.clone=function(){ 
  return new Camera(this.pos, this.dirmz, this.dirx, this.screenDistance);
};

//g0 ���W�n�̈ʒu�x�N�g�� x �� g1 ���W�n�̒l�ɕϊ� 
var transPos=function(x, g0, g1){
  var y = new Array(g0.dims);
  for(var d=0;d<g0.dims;d++){
    y[d] = (x[d]-g0.w[0][d])*g0.iww[d]*g1.ww[d]+g1.w[0][d];
  }
  return y;
};
var transPosInt=function(x, g0, g1){
  var y = new Array(g0.dims);
  for(var d=0;d<g0.dims;d++){
    y[d] = Math.floor((x[d]-g0.w[0][d])*g0.iww[d]*g1.ww[d]+g1.w[0][d]);
  }
  return y;
};
//g0 ���W�n�̕����x�N�g�� x �� g1 ���W�n�̒l�ɕϊ� 
var transScale=function(x, g0, g1){
  var y = new Array(g0.dims);
  for(var d=0;d<g0.dims;d++){
    y[d] = x[d]*g0.iww[d]*g1.ww[d];
  }
  return y;
};
//g0 ���W�n�ł̎����C���f�N�X d �̈ʒu�x�N�g������ x �� g1 ���W�n�̒l�ɕϊ� 
var transPosElem = function(x, d, g0, g1){
  return (x-g0.w[0][d])*g0.iww[d]*g1.ww[d]+g1.w[0][d];
};
//g0 ���W�n�ł̎����C���f�N�X d �̕����x�N�g������ x �� g1 ���W�n�̒l�ɕϊ� 
var transScaleElem = function(x, d, g0, g1){
  return  x*g0.iww[d]*g1.ww[d];
};
//3D ���W gW �ɂ� target �̈ʒu�ɂ���_��
//�J��������݂��Ƃ��� 2D ���W gS �ł̈ʒu (sx[2] �ɂ͎����a������) (double)
var transCam = function(target, c, c0, gW, gS){
  var camr = getRotate(c.dirmz, c.dirx, c0.dirmz, c0.dirx);
  var cx = mulxv(camr, sub(target, c.pos));
  var psz = c.screenDistance/cx[2];
  var psx = [cx[0] * psz, cx[1] * psz , psz];
  //�X�N���[�����W�n�ɕϊ�
  var sx = new Array(3);
  sx[0] = transPosElem(psx[0], 0, gW, gS);
  sx[1] = transPosElem(psx[1], 1, gW, gS);
  sx[2] = transScaleElem(psx[2], 2, gW, gS);
  return sx;
};

/* a0 �� a1 �Ɉړ����邽�߂̌��_���S�̉�] r */
var getRotatePos = function(ina0, ina1){
  // a0�Ea1 =  cos��  (��=��]�p)
  // a0�~a1 = e sin�� (��=��]�p, e = �������P�ʃx�N�g��)
  // e sin�� =  a0�~a1
  //  |sin��| = |a0�~a1|
  // e       = (a0�~a1)/|a0�~a1| = normalize(a0�~a1)
  var a0 = normalize(ina0);
  var a1 = normalize(ina1); 
  var cos  = dot(a0,a1);
  var c = cross(a0,a1);
  var sin  = abs(c);
  var e = normalize(c);
  if(sin > 10e-80){
    //�ʏ�̊p�x
    return ang2rot(e, cos, sin);
  }else{
    if(cos > 0){
      // 0 deg
      return [[1,0,0],[0,1,0],[0,0,1]];
    }else{
      //180 deg
      c = cross(a0, [1,0,0]);
      if(abs(c)>10e-80){
        return [[1,0,0],[0,-1,0],[0,0,-1]];
      }else{
        return [[-1,0,0],[0,1,0],[0,0,-1]];
      }
    }
  }
};
var angTheta2rot = function(a, theta){
 return ang2rot(a, Math.cos(theta), Math.sin(theta));
}

/* �� (a0,b0) �� (a1,b1) �Ɉړ����邽�߂̌��_���S�̉�] r */
var getRotate = function(ina0, inb0, ina1, inb1){
  if(ina1 != undefined){
    var a0 = normalize(ina0);
    var b0 = normalize(inb0);
    var a1 = normalize(ina1);
    var b1 = normalize(inb1);
    
    // �܂��� a0��a1 �ō��킹���] r0
    var r0 = getRotatePos(a0, a1); 
    var b2 = mul(r0, b0); // b2 = r0 ��� b0
    
    // b2 �� b1 �ɓ�������] r1 �����߂�B���� a1 �ɂ���΂悢
    var cos = dot(b1,b2);
    var handedness = dot(a1, cross(b2,b1)); //����
    var sin = abs(cross(b1,b2));
    
    if(abs(sub(b1,b2))<1e-96){
      return r0;  //��]�Ȃ�
    }else if(handedness<0){
      sin = -sin; //���̏���
    }
    var r1 = ang2rot(a1, cos, sin);
    return mul(r1, r0);// r0��r1
  }else{
    return getRotatePos(ina0, inb0); //�_�̉�]�ړ��ɕύX
  }
};

var testGeom=function(){
  var str="";
  str += "ww=" + mat2str(g0.iww) + " , ";
  return str;
};
/*  cam.pos =(0,0,0) �ƃX�N���[����̓_ (sxi, syi) �̒������J�������W�n�ŕԂ� */
var getCamLine=function(cam, sxi, syi){
  var cl = new Array(2);
  c[0]=new Array(3);
  c[1]=new Array(3);
  // cl[0]={0,0,0};
  //�X�N���[�����W�n �� �J�������W�n�ɕϊ�
  cl[1][0] = gS.transPos(sxi, 0, gP);
  cl[1][1] = gS.transPos(syi, 1, gP);
  cl[1][2] = cam.screenDistance;
  return cl;
}
