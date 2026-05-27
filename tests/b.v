module register_1c2 #(
 parameter ADDR = 0
) (
 input clk,
 input reset,
 input SS,
 input [7:0] data_from_master,
 input rcv,
 input [15:0] data_from_fpga,
 input button,
 output load,
 output [7:0] data_out,
 output [47:0] register_out
);
 //      +------+
 //      | IDLE |
 //      +------+                                    
 //         |                                        
 //         | rcv && bytes_from_master_counter == 0  
  //        v                                        
 //    +------------+                                
 //    | ADDR_MODUL |                            
 //    +------------+                                
 //         |                                    
 //         | received_addr == ADDR                  
 //         |--------------------------------------->|
 //         |                                        |
 //         | rw == 1                                | rw == 0
 //         v                                        v
 //    +-------+                                +--------+
 //    | READ  |                                | WRITE  |
 //    +-------+                                +--------+
 //         |                                       |
 //         | bytes_from_master_counter >= 16       |
 //         |-------------------------------------->|
 //         |                                       |
 //         +---------------------------------------+
 //            back to idel per restet or SS is high
 //halo
 
 
 parameter IDLE       = 3'b000,
           ADDR_MODUL = 3'b001,
           READ       = 3'b010,
           WRITE      = 3'b110;
 parameter ADDR = 16;
 parameter max_register = 6;
 
 reg [2:0] state;
 
 reg signed [7:0] registers [0:max_register-1];
 
 reg [4:0] bytes_from_master_counter;
 reg [7:0] data_pointer;
 reg rw;
 reg [5:0] received_addr;
 
 reg load_data_on_slave_ready;
 assign load = load_data_on_slave_ready;
 
 reg [7:0] data_from_slave;
 assign data_out = data_from_slave;
 
 reg load_slave_o;
 
 assign register_out = {
     registers[0],
     registers[1],
     registers[2],
     registers[3],
     registers[4],
     registers[5]
 };
 
 always @(posedge clk) begin
 
     if (!reset) begin
 
         state <= IDLE;
         bytes_from_master_counter <= 0;
         data_pointer <= 0;
         received_addr <= 0;
         load_data_on_slave_ready <= 0;
         data_from_slave <= 0;
         rw <= 0;
         load_slave_o <= 0;
 
         registers[0] <= 8'b0;
         registers[1] <= 8'b0;
         registers[2] <= 8'b0;
         registers[3] <= 8'b0;
         registers[4] <= 8'b0;
         registers[5] <= 8'b0;
 
     end
     else if (SS) begin
 
         state <= IDLE;
         bytes_from_master_counter <= 0;
         data_pointer <= 0;
         received_addr <= 0;
         load_data_on_slave_ready <= 0;
         data_from_slave <= 0;
         rw <= 0;
         load_slave_o <= 0;
 
     end
     else if (rcv) begin
 
         bytes_from_master_counter <= bytes_from_master_counter + 1;
 
         case (state)
 
             IDLE: begin
 
                 rw <= data_from_master[7];
                 received_addr <= data_from_master[5:0];
 
                 data_pointer <= 0;
 
                 load_data_on_slave_ready <= 0;
                 load_slave_o <= 0;
 
                 if (bytes_from_master_counter == 0)
                     state <= ADDR_MODUL;
                 else
                     state <= IDLE;
 
             end
 
             ADDR_MODUL: begin
 
                 if (received_addr == ADDR) begin
 
                     data_pointer <= data_from_master;
 
                     if (data_from_master == 8'hF0)
                         data_from_slave <= data_from_fpga[15:8];
 
                     else if (data_from_master == 8'hF1)
                         data_from_slave <= data_from_fpga[7:0];
 
                     else if (data_from_master == 8'hFE)
                         data_from_slave <= {7'h00, button};
 
                     else if (data_from_master <= 8'h05)
                         data_from_slave <= registers[data_from_master];
 
                     else
                         data_from_slave <= 8'hDD;
 
                     load_data_on_slave_ready <= 1;
 
                     if (rw)
                         state <= READ;
                     else
                         state <= WRITE;
 
                 end
                 else begin
                     state <= IDLE;
                 end
 
             end
 
             READ: begin
 
                 data_pointer <= data_pointer + 1;
 
                 data_from_slave <= data_from_fpga[7:0];
 
                 load_data_on_slave_ready <= 1;
 
                 if (bytes_from_master_counter >= max_register)
                     state <= IDLE;
                 else
                     state <= READ;
 
             end
 
             WRITE: begin
 
                 if (data_pointer < max_register)
                     registers[data_pointer] <= data_from_master;
 
                 data_pointer <= data_pointer + 1;
 
                 load_slave_o <= 1;
 
                 if (bytes_from_master_counter >= max_register)
                     state <= IDLE;
                 else
                     state <= WRITE;
 
             end
 
             default: begin
                 state <= IDLE;
             end
 
         endcase
 
     end
     else begin
 
         load_data_on_slave_ready <= 0;
         load_slave_o <= 0;
 
     end
 
 end
endmodule
