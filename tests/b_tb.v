`timescale 1ns/1ps

module tb_register_1c2;

    reg        clk;
    reg        reset;
    reg        SS;
    reg  [7:0] data_from_master;
    reg        rcv;
    reg [15:0] data_from_fpga;
    reg        button;

    wire        load;
    wire  [7:0] data_out;
    wire [47:0] register_out;

    // ADDR=16 matches the parameter redeclared inside the module body
    register_1c2 #(.ADDR(16)) dut (
        .clk(clk), .reset(reset), .SS(SS),
        .data_from_master(data_from_master),
        .rcv(rcv),
        .data_from_fpga(data_from_fpga),
        .button(button),
        .load(load),
        .data_out(data_out),
        .register_out(register_out)
    );

    initial clk = 0;
    always #5 clk = ~clk;

    // Send one byte and pulse rcv for one clock
    task send_byte;
        input [7:0] b;
        begin
            @(negedge clk);
            data_from_master = b;
            rcv = 1;
            @(posedge clk); #1;
            rcv = 0;
        end
    endtask

    // Assert SS high for one clock to reset the state machine between transactions
    task end_txn;
        begin
            @(negedge clk);
            SS = 1;
            @(posedge clk); #1;
            SS = 0;
        end
    endtask

    integer fail_count;

    task check;
        input [63:0] got;
        input [63:0] expected;
        input [127:0] label;
        begin
            if (got !== expected) begin
                $display("FAIL [%s]: got %h, expected %h", label, got, expected);
                fail_count = fail_count + 1;
            end else begin
                $display("PASS [%s]: %h", label, got);
            end
        end
    endtask

    initial begin
        $dumpfile("ce_sim.vcd");
        $dumpvars(0, tb_register_1c2);

        fail_count       = 0;
        reset            = 0;
        SS               = 1;
        data_from_master = 0;
        rcv              = 0;
        data_from_fpga   = 16'hABCD;
        button           = 0;

        // ── Apply active-low reset ──────────────────────────────────────────
        repeat(2) @(posedge clk); #1;
        reset = 1;
        SS    = 0;

        // ── Test 1: WRITE to register[0] ────────────────────────────────────
        // Byte 0: rw=0, addr=16  → {0, x, 6'h10} = 0x10
        // Byte 1: pointer = 0x00 → ADDR_MODUL→WRITE, data_pointer=0
        // Byte 2: data = 0xA5    → registers[0] = 0xA5
        send_byte(8'h10);   // header: write to addr 16
        send_byte(8'h00);   // pointer → register index 0
        send_byte(8'hA5);   // value written to registers[0]
        end_txn;

        @(posedge clk); #1;
        check(register_out[47:40], 8'hA5, "T1: registers[0] after write");

        // ── Test 2: WRITE to register[1] ────────────────────────────────────
        send_byte(8'h10);
        send_byte(8'h01);   // pointer = 1
        send_byte(8'hB6);
        end_txn;

        @(posedge clk); #1;
        check(register_out[39:32], 8'hB6, "T2: registers[1] after write");

        // ── Test 3: READ register[0] ─────────────────────────────────────────
        // Byte 0: rw=1, addr=16  →  {1, 0, 6'h10} = 0x90
        // Byte 1: pointer = 0x00 → reads registers[0], asserts load
        send_byte(8'h90);
        send_byte(8'h00);
        // load is only high for the one rcv cycle — sample immediately, not after the next clock
        check(data_out, 8'hA5, "T3: READ registers[0]");
        check(load,     1'b1,  "T3: load asserted");
        end_txn;

        // ── Test 4: READ register[1] ─────────────────────────────────────────
        send_byte(8'h90);
        send_byte(8'h01);
        @(posedge clk); #1;
        check(data_out, 8'hB6, "T4: READ registers[1]");
        end_txn;

        // ── Test 5: READ FPGA data high byte (0xF0) ──────────────────────────
        send_byte(8'h90);
        send_byte(8'hF0);
        @(posedge clk); #1;
        check(data_out, 8'hAB, "T5: READ fpga[15:8]");  // data_from_fpga=0xABCD
        end_txn;

        // ── Test 6: READ FPGA data low byte (0xF1) ───────────────────────────
        send_byte(8'h90);
        send_byte(8'hF1);
        @(posedge clk); #1;
        check(data_out, 8'hCD, "T6: READ fpga[7:0]");
        end_txn;

        // ── Test 7: READ button state (0xFE) ─────────────────────────────────
        button = 1;
        send_byte(8'h90);
        send_byte(8'hFE);
        @(posedge clk); #1;
        check(data_out, 8'h01, "T7: READ button=1");
        end_txn;
        button = 0;

        // ── Test 8: Unknown pointer → 0xDD sentinel ──────────────────────────
        send_byte(8'h90);
        send_byte(8'h10);   // 0x10 is not a valid register or special address
        @(posedge clk); #1;
        check(data_out, 8'hDD, "T8: unknown pointer returns 0xDD");
        end_txn;

        // ── Test 9: Wrong address → state machine ignores ─────────────────────
        send_byte(8'h11);   // addr=17 ≠ 16
        send_byte(8'hA5);   // ADDR_MODUL rejects addr, goes back to IDLE
        end_txn;
        @(posedge clk); #1;
        check(register_out[47:40], 8'hA5, "T9: wrong addr, registers[0] unchanged");

        // ── Test 10: SS abort mid-transaction ────────────────────────────────
        send_byte(8'h10);                               // start write
        @(negedge clk); SS = 1; @(posedge clk); #1;    // abort via SS
        SS = 0;
        send_byte(8'hFF);                               // arrives in reset IDLE
        end_txn;
        @(posedge clk); #1;
        check(register_out[47:40], 8'hA5, "T10: SS abort, registers[0] unchanged");

        // ── Test 11: Active-low reset clears registers ────────────────────────
        reset = 0;
        repeat(2) @(posedge clk); #1;
        reset = 1;
        @(posedge clk); #1;
        check(register_out, 48'h0, "T11: all registers zeroed after reset");

        // ── Summary ───────────────────────────────────────────────────────────
        if (fail_count == 0)
            $display("\nAll tests passed.");
        else
            $display("\n%0d test(s) FAILED.", fail_count);

        $finish;
    end

endmodule
