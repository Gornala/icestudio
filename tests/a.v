module i2c_master (
 input clock,
 input reset_n,
 input enable,
 input read_write,
 input [15:0] mosi_data,
 input [7:0] register_address,
 input [6:0] device_address,
 input in_external_serial_data,
 input in_external_serial_clock,
 output [15:0] o_miso_data,
 output o_busy,
 output o_enable_external_serial_data,
 output o_out_external_serial_data,
 output o_enable_external_serial_clock,
 output o_out_external_serial_clock
);
 // master I2C module
 // clock must be 4x the desired SCL frequency
 
 // ---------------------------------------------------------------------------
 // State encoding
 // ---------------------------------------------------------------------------
 localparam [4:0]
     RESET        = 5'd0,
     IDLE         = 5'd1,
     W_START      = 5'd2,
     W_ADDR       = 5'd3,
     W_ACK_ADDR   = 5'd4,
     W_REG        = 5'd5,
     W_ACK_REG    = 5'd6,
     W_DATA0      = 5'd7,
     W_ACK_DATA0  = 5'd8,
     W_DATA1      = 5'd9,
     W_ACK_DATA1  = 5'd10,
     W_STOP       = 5'd11,
     R_START      = 5'd12,
     R_ADDR_W     = 5'd13,
     R_ACK_ADDR_W = 5'd14,
     R_REG        = 5'd15,
     R_ACK_REG    = 5'd16,
     R_RSTART     = 5'd17,
     R_ADDR_R     = 5'd18,
     R_ACK_ADDR_R = 5'd19,
     R_DATA0      = 5'd20,
     R_ACK_DATA0  = 5'd21,
     R_DATA1      = 5'd22,
     R_NACK       = 5'd23,
     R_STOP       = 5'd24;
 
 // ---------------------------------------------------------------------------
 // Internal registers
 // ---------------------------------------------------------------------------
 reg [4:0]  state;
 reg [1:0]  phase;       // intra-bit timing: 0=SCL↓ set SDA, 1=SCL↑, 2=sample, 3=SCL↓ advance
 reg [2:0]  bit_cnt;     // counts 7..0 across an 8-bit transfer
 reg        ack_latch;   // holds sampled ACK/NACK from phase 2 so phase 3 sees stable value
 reg [6:0]  lat_dev_addr;
 reg [7:0]  lat_reg_addr;
 reg [15:0] lat_mosi;
 reg [7:0]  shift_reg;
 
 // ---------------------------------------------------------------------------
 // output register registers
 // ---------------------------------------------------------------------------
 
 reg [15:0]miso_data;
 assign o_miso_data = miso_data;
 reg busy;
 assign o_busy = busy;
 
 reg enable_external_serial_data;
 assign o_enable_external_serial_data = enable_external_serial_data;
 
 reg out_external_serial_data;
 assign o_out_external_serial_data = out_external_serial_data;
 
 reg enable_external_serial_clock;
 assign o_enable_external_serial_clock = enable_external_serial_clock;
 
 reg out_external_serial_clock;
 assign o_out_external_serial_clock = out_external_serial_clock;
 
 // ---------------------------------------------------------------------------
 // Register numbering — every state must follow this order:
 //  0  state
 //  1  phase
 //  2  bit_cnt
 //  3  ack_latch
 //  4  busy
 //  5  miso_data
 //  6  enable_external_serial_data
 //  7  out_external_serial_data
 //  8  enable_external_serial_clock  (always 1'b0; not reassigned after RESET)
 //  9  out_external_serial_clock
 // 10  lat_dev_addr
 // 11  lat_reg_addr
 // 12  lat_mosi
 // 13  shift_reg
 // ---------------------------------------------------------------------------
 
 always @(posedge clock) begin
     if (!reset_n) begin
         state                        <= RESET;   //0
         phase                        <= 2'd0;    //1
         bit_cnt                      <= 3'd0;    //2
         ack_latch                    <= 1'b0;    //3
         busy                         <= 1'b0;    //4
         miso_data                    <= 16'd0;   //5
         enable_external_serial_data  <= 1'b1;    //6  I2C idle: SDA released
         out_external_serial_data     <= 1'b1;    //7
         enable_external_serial_clock <= 1'b0;    //8  always drive SCL
         out_external_serial_clock    <= 1'b1;    //9  I2C idle: SCL high
         lat_dev_addr                 <= 7'd0;    //10
         lat_reg_addr                 <= 8'd0;    //11
         lat_mosi                     <= 16'd0;   //12
         shift_reg                    <= 8'd0;    //13
     end else begin
         case (state)
 
             // ----------------------------------------------------------------
             RESET: begin
                 state                        <= IDLE;   //0
                 phase                        <= 2'd0;   //1
                 bit_cnt                      <= 3'd0;   //2
                 ack_latch                    <= 1'b0;   //3
                 busy                         <= 1'b0;   //4
                 miso_data                    <= 16'd0;  //5
                 enable_external_serial_data  <= 1'b1;   //6
                 out_external_serial_data     <= 1'b1;   //7
                 enable_external_serial_clock <= 1'b0;   //8
                 out_external_serial_clock    <= 1'b1;   //9
                 lat_dev_addr                 <= 7'd0;   //10
                 lat_reg_addr                 <= 8'd0;   //11
                 lat_mosi                     <= 16'd0;  //12
                 shift_reg                    <= 8'd0;   //13
             end
 
             // ----------------------------------------------------------------
             IDLE: begin
                 // state will be conditionally set                   //0
                 phase                        <= 2'd0;               //1
                 bit_cnt                      <= 3'd0;               //2
                 // ack_latch holds previous value                    //3
                 // busy will be conditionally set                    //4
                 // miso_data holds previous value                    //5
                 enable_external_serial_data  <= 1'b1;               //6
                 out_external_serial_data     <= 1'b1;               //7
                 enable_external_serial_clock <= 1'b0;               //8
                 out_external_serial_clock    <= 1'b1;               //9
                 // lat_dev_addr will be conditionally set            //10
                 // lat_reg_addr will be conditionally set            //11
                 // lat_mosi will be conditionally set                //12
                 // shift_reg holds previous value                    //13
 
                 if (enable) begin
                     state        <= read_write ? R_START : W_START; //0
                     busy         <= 1'b1;                           //4
                     lat_dev_addr <= device_address;                 //10
                     lat_reg_addr <= register_address;               //11
                     lat_mosi     <= mosi_data;                      //12
                 end else begin
                     state <= IDLE;                                  //0
                     busy  <= 1'b0;                                  //4
                     // lat_dev_addr holds previous value             //10
                     // lat_reg_addr holds previous value             //11
                     // lat_mosi holds previous value                 //12
                 end
             end
 
             // ================================================================
             // WRITE BRANCH
             // ================================================================
 
             W_START: begin
                 state                        <= W_ADDR;               //0
                 phase                        <= 2'd0;                 //1
                 bit_cnt                      <= 3'd7;                 //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 enable_external_serial_data  <= 1'b0;                //6  drive SDA
                 out_external_serial_data     <= 1'b0;                //7  SDA low = START
                 // enable_external_serial_clock holds (1'b0)         //8
                 out_external_serial_clock    <= 1'b1;                //9  SCL remains high
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 shift_reg                    <= {lat_dev_addr, 1'b0}; //13 addr + W bit
             end
 
             W_ADDR: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= W_ACK_ADDR;                     //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= W_ADDR;                     //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             W_ACK_ADDR: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6  release SDA — slave drives ACK
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3  0=ACK, 1=NACK
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state     <= W_REG;                      //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= 3'd7;                       //2
                             shift_reg <= lat_reg_addr;               //13
                         end
                     end
                 endcase
             end
 
             W_REG: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= W_ACK_REG;                      //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= W_REG;                      //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             W_ACK_REG: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state     <= W_DATA0;                    //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= 3'd7;                       //2
                             shift_reg <= lat_mosi[15:8];             //13 high byte
                         end
                     end
                 endcase
             end
 
             W_DATA0: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= W_ACK_DATA0;                    //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= W_DATA0;                    //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             W_ACK_DATA0: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state     <= W_DATA1;                    //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= 3'd7;                       //2
                             shift_reg <= lat_mosi[7:0];              //13 low byte
                         end
                     end
                 endcase
             end
 
             W_DATA1: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= W_ACK_DATA1;                    //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= W_DATA1;                    //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             W_ACK_DATA1: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt holds previous value                       //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state <= W_STOP;                         //0
                             phase <= 2'd0;                           //1
                         end
                     end
                 endcase
             end
 
             W_STOP: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt holds previous value                       //2
                 // ack_latch holds previous value                     //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6  drive SDA
                         out_external_serial_data    <= 1'b0;         //7  SDA low
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9  SCL rises
                     end
                     2'd2: begin
                         phase                    <= 2'd3;            //1
                         out_external_serial_data <= 1'b1;            //7  SDA rises = STOP
                     end
                     2'd3: begin
                         state                       <= IDLE;         //0
                         phase                       <= 2'd0;         //1
                         busy                        <= 1'b0;         //4
                         enable_external_serial_data <= 1'b1;         //6  release SDA
                     end
                 endcase
             end
 
             // ================================================================
             // READ BRANCH
             // ================================================================
 
             R_START: begin
                 state                        <= R_ADDR_W;              //0
                 phase                        <= 2'd0;                  //1
                 bit_cnt                      <= 3'd7;                  //2
                 // ack_latch holds previous value                       //3
                 // busy holds previous value (1'b1)                     //4
                 // miso_data holds previous value                       //5
                 enable_external_serial_data  <= 1'b0;                 //6  drive SDA
                 out_external_serial_data     <= 1'b0;                 //7  SDA low = START
                 // enable_external_serial_clock holds (1'b0)           //8
                 out_external_serial_clock    <= 1'b1;                 //9  SCL remains high
                 // lat_dev_addr holds previous value                    //10
                 // lat_reg_addr holds previous value                    //11
                 // lat_mosi holds previous value                        //12
                 shift_reg                    <= {lat_dev_addr, 1'b0}; //13 addr + W (send reg first)
             end
 
             R_ADDR_W: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= R_ACK_ADDR_W;                   //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= R_ADDR_W;                   //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             R_ACK_ADDR_W: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6  release SDA
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state     <= R_REG;                      //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= 3'd7;                       //2
                             shift_reg <= lat_reg_addr;               //13
                         end
                     end
                 endcase
             end
 
             R_REG: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= R_ACK_REG;                      //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= R_REG;                      //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             R_ACK_REG: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt holds previous value                       //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state <= R_RSTART;                       //0
                             phase <= 2'd0;                           //1
                         end
                     end
                 endcase
             end
 
             R_RSTART: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be set in phase 3                   //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6  drive SDA
                         out_external_serial_data    <= 1'b1;         //7  SDA high
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9  SCL rises
                     end
                     2'd2: begin
                         phase                    <= 2'd3;            //1
                         out_external_serial_data <= 1'b0;            //7  SDA falls = repeated START
                     end
                     2'd3: begin
                         state                     <= R_ADDR_R;       //0
                         phase                     <= 2'd0;           //1
                         bit_cnt                   <= 3'd7;           //2
                         out_external_serial_clock <= 1'b0;           //9
                         shift_reg                 <= {lat_dev_addr, 1'b1}; //13 addr + R bit
                     end
                 endcase
             end
 
             R_ADDR_R: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg will be conditionally set                //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6
                         out_external_serial_data    <= shift_reg[7]; //7
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= R_ACK_ADDR_R;                   //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state     <= R_ADDR_R;                   //0
                             phase     <= 2'd0;                       //1
                             bit_cnt   <= bit_cnt - 1'd1;             //2
                             shift_reg <= {shift_reg[6:0], 1'b0};     //13
                         end
                     end
                 endcase
             end
 
             R_ACK_ADDR_R: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch will be set in phase 2                   //3
                 // busy will be conditionally set                     //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase     <= 2'd3;                           //1
                         ack_latch <= in_external_serial_data;        //3
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (ack_latch) begin
                             state <= IDLE;                           //0
                             phase <= 2'd0;                           //1
                             busy  <= 1'b0;                           //4
                         end else begin
                             state   <= R_DATA0;                      //0
                             phase   <= 2'd0;                         //1
                             bit_cnt <= 3'd7;                         //2
                         end
                     end
                 endcase
             end
 
             R_DATA0: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data[15:8] shifted in during phase 2          //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6  release SDA — slave drives
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase           <= 2'd3;                     //1
                         miso_data[15:8] <= {miso_data[14:8], in_external_serial_data}; //5
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= R_ACK_DATA0;                    //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state   <= R_DATA0;                      //0
                             phase   <= 2'd0;                         //1
                             bit_cnt <= bit_cnt - 1'd1;               //2
                         end
                     end
                 endcase
             end
 
             R_ACK_DATA0: begin
                 // state will be set in phase 3                       //0
                 // phase will be set                                  //1
                 // bit_cnt will be set in phase 3                     //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6  drive SDA
                         out_external_serial_data    <= 1'b0;         //7  ACK
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         state                     <= R_DATA1;        //0
                         phase                     <= 2'd0;           //1
                         bit_cnt                   <= 3'd7;           //2
                         out_external_serial_clock <= 1'b0;           //9
                     end
                 endcase
             end
 
             R_DATA1: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt will be conditionally set                  //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data[7:0] shifted in during phase 2           //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data holds previous value      //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b1;         //6  release SDA — slave drives
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase          <= 2'd3;                      //1
                         miso_data[7:0] <= {miso_data[6:0], in_external_serial_data}; //5
                     end
                     2'd3: begin
                         out_external_serial_clock <= 1'b0;           //9
                         if (bit_cnt == 3'd0) begin
                             state <= R_NACK;                         //0
                             phase <= 2'd0;                           //1
                         end else begin
                             state   <= R_DATA1;                      //0
                             phase   <= 2'd0;                         //1
                             bit_cnt <= bit_cnt - 1'd1;               //2
                         end
                     end
                 endcase
             end
 
             R_NACK: begin
                 // state will be set in phase 3                       //0
                 // phase will be set                                  //1
                 // bit_cnt holds previous value                       //2
                 // ack_latch holds previous value                     //3
                 // busy holds previous value (1'b1)                   //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6  drive SDA
                         out_external_serial_data    <= 1'b1;         //7  NACK (SDA high)
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9
                     end
                     2'd2: begin
                         phase <= 2'd3;                               //1
                     end
                     2'd3: begin
                         state                     <= R_STOP;         //0
                         phase                     <= 2'd0;           //1
                         out_external_serial_clock <= 1'b0;           //9
                     end
                 endcase
             end
 
             R_STOP: begin
                 // state will be conditionally set                    //0
                 // phase will be conditionally set                    //1
                 // bit_cnt holds previous value                       //2
                 // ack_latch holds previous value                     //3
                 // busy will be set in phase 3                        //4
                 // miso_data holds previous value                     //5
                 // enable_external_serial_data will be set            //6
                 // out_external_serial_data will be set               //7
                 // enable_external_serial_clock holds (1'b0)         //8
                 // out_external_serial_clock will be set              //9
                 // lat_dev_addr holds previous value                  //10
                 // lat_reg_addr holds previous value                  //11
                 // lat_mosi holds previous value                      //12
                 // shift_reg holds previous value                     //13
                 case (phase)
                     2'd0: begin
                         phase                       <= 2'd1;         //1
                         enable_external_serial_data <= 1'b0;         //6  drive SDA
                         out_external_serial_data    <= 1'b0;         //7  SDA low
                         out_external_serial_clock   <= 1'b0;         //9
                     end
                     2'd1: begin
                         phase                     <= 2'd2;           //1
                         out_external_serial_clock <= 1'b1;           //9  SCL rises
                     end
                     2'd2: begin
                         phase                    <= 2'd3;            //1
                         out_external_serial_data <= 1'b1;            //7  SDA rises = STOP
                     end
                     2'd3: begin
                         state                       <= IDLE;         //0
                         phase                       <= 2'd0;         //1
                         busy                        <= 1'b0;         //4
                         enable_external_serial_data <= 1'b1;         //6  release SDA
                     end
                 endcase
             end
 
             default: state <= RESET;
 
         endcase
     end
 end
endmodule
