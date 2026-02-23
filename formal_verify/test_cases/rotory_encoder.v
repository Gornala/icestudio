// Previous state of A and B
reg A_prev, B_prev;
// output register
reg [7:0]register_decoder_o;
assign  register_decoder = register_decoder_o;

// Combine previous and current state into 4-bit value for direction detection
wire [1:0] prev_state = {A_prev, B_prev};
wire [1:0] curr_state = {A_debounced, B_debounced};
wire [3:0] transition = {prev_state, curr_state};

always @(posedge clk) begin
    if (~reset) begin
        register_decoder_o <= 8'd0;
        A_prev <= A_debounced;
        B_prev <= B_debounced;
    end else begin
        case (transition)
            4'b0001, 4'b0111, 4'b1110, 4'b1000: register_decoder_o <= register_decoder_o + 1; // CW
            4'b0010, 4'b0100, 4'b1101, 4'b1011: register_decoder_o <= register_decoder_o - 1; // CCW
            default: ; // No change or invalid
        endcase

        // Update previous states
        A_prev <= A_debounced;
        B_prev <= B_debounced;
    end
end
