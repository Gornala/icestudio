

reg d1;
reg d2;

always @(posedge clk)
 d1 <= i;
 
always @(posedge clk)
  d2 <= d1;
  
assign o = d2;