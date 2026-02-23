// states
parameter IDLE = 2'b00; 
parameter COMUNICAT = 2'b01;
parameter COMOVER = 2'b10;
//register
reg [7:0] shift_reg;
reg [7:0] shift_reg_form_slave;
reg [7:0] received_data;
reg [7:0] bit_count;
reg [7:0] clk_count;
reg sck_toggle;
reg [1:0]state;

//output register
reg busy_o;
assign busy = busy_o;
reg new_data_o;
assign new_data = new_data_o;
reg SCK_o;
assign SCK = SCK_o;
reg CS_o;
assign CS = CS_o;
reg MOSI_o;
assign MOSI = MOSI_o;
reg [7:0]data_fom_slave_o;
assign data_from_slave = data_fom_slave_o;

//main 
always @(posedge clk) begin
    if (~reset) begin
        state <= IDLE;
        busy_o <= 0;
        new_data_o <= 0;
        SCK_o <= (mode[1] == 1'b0) ? 0 : 1; // Set initial SCK based on mode
        CS_o <= 1;
        MOSI_o <= 0;
        shift_reg <= 0;
        received_data <= 0;
        bit_count <= 0;
        data_fom_slave_o <= 0;
    end else begin
        case (state)
        // wait for comunication
            IDLE: begin
                if (load) begin
                    shift_reg <= data_from_master;
                    bit_count <= 0;
                    CS_o <= 0;
                    state <= COMUNICAT;
                end else 
                begin // idle and reset reset all register
                    state <= IDLE;
                    busy_o <= 0;
                    new_data_o <= 0;
                    SCK_o <= (mode[1] == 1'b0) ? 0 : 1; // Set initial SCK based on mode
                    CS_o <= 1;
                    MOSI_o <= 0;
                    shift_reg <= 0;
                    received_data <= 0;
                    bit_count <= 0;
                    data_fom_slave_o <= 0;
                end
            end
        // comunicate
            COMUNICAT: 
            begin
                busy_o <= 1; // we are now busy
                if (clk_count < freq_div) // here we stay most of the time devide by 2 alwasy.
                begin
                    clk_count <= clk_count + 1;
                end else // run only if we reach freq_div
                begin
                    clk_count <= 0; 
                    
                    SCK_o <= ~SCK_o;
                    if ((mode[0] == 1'b0 && SCK_o == 1'b0) || (mode[0] == 1'b1 && SCK_o == 1'b1)) // handle rising or fallinf edge
                    begin
                        MOSI_o <= shift_reg[7];
                        shift_reg <= {shift_reg[6:0], MISO};
                    end

                    bit_count <= bit_count + 1; //counter to know when comuncation is over
                    if (bit_count == (number_of_bytes*16))
                        state <= COMOVER;
                    else 
                        state <= COMUNICAT;
                end
            end
            // finish comunication
            COMOVER: begin
                data_fom_slave_o <= shift_reg; //data to the output reg
                busy_o <= 0; // we are not busy anmore
                new_data_o <= 1; // there is new data
                state <= IDLE; //back to idle
            end
        endcase
    end
end