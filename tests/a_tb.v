`timescale 1ns/1ps

module tb_i2c_master;

  // -------------------------------------------------------------------------
  // DUT connections
  // -------------------------------------------------------------------------
  reg        clock;
  reg        reset_n;
  reg        enable;
  reg        read_write;
  reg [15:0] mosi_data;
  reg [7:0]  register_address;
  reg [6:0]  device_address;
  reg        in_external_serial_data;
  reg        in_external_serial_clock;

  wire [15:0] o_miso_data;
  wire        o_busy;
  wire        o_enable_external_serial_data;
  wire        o_out_external_serial_data;
  wire        o_enable_external_serial_clock;
  wire        o_out_external_serial_clock;

  i2c_master dut (
    .clock                          (clock),
    .reset_n                        (reset_n),
    .enable                         (enable),
    .read_write                     (read_write),
    .mosi_data                      (mosi_data),
    .register_address               (register_address),
    .device_address                 (device_address),
    .in_external_serial_data        (in_external_serial_data),
    .in_external_serial_clock       (in_external_serial_clock),
    .o_miso_data                    (o_miso_data),
    .o_busy                         (o_busy),
    .o_enable_external_serial_data  (o_enable_external_serial_data),
    .o_out_external_serial_data     (o_out_external_serial_data),
    .o_enable_external_serial_clock (o_enable_external_serial_clock),
    .o_out_external_serial_clock    (o_out_external_serial_clock)
  );

  initial begin
    $dumpfile("ce_sim.vcd");
    $dumpvars(0, tb_i2c_master);
  end

  // 10 ns clock period; SCL = clk/4 = 25 MHz
  initial clock = 0;
  always #5 clock = ~clock;

  // =========================================================================
  // Slave model
  // =========================================================================
  // Counts every SCL rising edge from the start of each transaction and drives
  // in_external_serial_data with ACK (0) or read-data bits at the correct
  // positions.  The tb_nack_addr flag forces a NACK at the address ACK slot.
  //
  // Write SCL-edge map (0-indexed from first SCL pulse after START):
  //   0-7   addr+W   (master drives)    8  ACK_ADDR  (slave -> 0)
  //   9-16  reg_addr (master drives)   17  ACK_REG   (slave -> 0)
  //  18-25  data_hi  (master drives)   26  ACK_DATA0 (slave -> 0)
  //  27-34  data_lo  (master drives)   35  ACK_DATA1 (slave -> 0)
  //
  // Read SCL-edge map:
  //   0-7   addr+W   (master)           8  ACK_ADDR_W (slave -> 0)
  //   9-16  reg_addr (master)          17  ACK_REG    (slave -> 0)
  //  18     rSTART SCL pulse (master, ignore)
  //  19-26  addr+R   (master)          27  ACK_ADDR_R (slave -> 0)
  //  28-35  data_hi  (slave drives rd_data[15:8] MSB-first)
  //  36     ACK_DATA0 (master drives, not slave)
  //  37-44  data_lo  (slave drives rd_data[7:0]  MSB-first)
  //  45     NACK     (master drives, not slave)

  integer    tb_scl_cnt;
  reg        tb_trans_active;
  reg        tb_is_read;
  reg [15:0] tb_rd_data;
  reg        tb_nack_addr;

  // Reset counter and capture transaction type when busy asserts;
  // release SDA and clear active flag when busy deasserts.
  always @(o_busy) begin
    if (o_busy) begin
      tb_scl_cnt      <= 0;
      tb_is_read      <= read_write;
      tb_trans_active <= 1;
    end else begin
      tb_trans_active         <= 0;
      in_external_serial_data <= 1'b1;
    end
  end

  // Drive SDA on every SCL rising edge while a transaction is active.
  always @(posedge o_out_external_serial_clock) begin
    if (tb_trans_active) begin
      if (!tb_is_read) begin
        // Write: slave only drives at the four ACK slots.
        if (tb_scl_cnt == 8 || tb_scl_cnt == 17 ||
            tb_scl_cnt == 26 || tb_scl_cnt == 35)
          in_external_serial_data <= (tb_nack_addr && tb_scl_cnt == 8) ? 1'b1 : 1'b0;
        else
          in_external_serial_data <= 1'b1;
      end else begin
        // Read: ACK slots, then two data bytes driven MSB-first.
        if (tb_scl_cnt == 8 || tb_scl_cnt == 17 || tb_scl_cnt == 27)
          in_external_serial_data <= (tb_nack_addr && tb_scl_cnt == 8) ? 1'b1 : 1'b0;
        else if (tb_scl_cnt >= 28 && tb_scl_cnt <= 35)
          in_external_serial_data <= tb_rd_data[15 - (tb_scl_cnt - 28)];
        else if (tb_scl_cnt >= 37 && tb_scl_cnt <= 44)
          in_external_serial_data <= tb_rd_data[7 - (tb_scl_cnt - 37)];
        else
          in_external_serial_data <= 1'b1;
      end
      tb_scl_cnt <= tb_scl_cnt + 1;
    end
  end

  // =========================================================================
  // Tasks
  // =========================================================================
  task do_reset;
    begin
      reset_n = 0;
      @(posedge clock);
      @(posedge clock);
      @(negedge clock);
      reset_n = 1;
    end
  endtask

  task trigger_write;
    input [6:0]  dev;
    input [7:0]  reg_a;
    input [15:0] data;
    begin
      @(negedge clock);
      device_address   = dev;
      register_address = reg_a;
      mosi_data        = data;
      read_write       = 0;
      enable           = 1;
      @(negedge clock);
      enable = 0;
    end
  endtask

  task trigger_read;
    input [6:0]  dev;
    input [7:0]  reg_a;
    input [15:0] rd_data;
    begin
      tb_rd_data       = rd_data;
      @(negedge clock);
      device_address   = dev;
      register_address = reg_a;
      read_write       = 1;
      enable           = 1;
      @(negedge clock);
      enable = 0;
    end
  endtask

  // Wait for the current transaction to complete.
  task wait_done;
    begin
      if (!o_busy) @(posedge o_busy);
      @(negedge o_busy);
      @(posedge clock);
    end
  endtask

  // =========================================================================
  // Stimulus
  // =========================================================================
  integer fail_count;

  initial begin
    fail_count               = 0;
    tb_trans_active          = 0;
    tb_nack_addr             = 0;
    tb_rd_data               = 0;
    in_external_serial_data  = 1'b1;
    in_external_serial_clock = 1'b1;
    enable                   = 0;
    read_write               = 0;
    mosi_data                = 0;
    register_address         = 0;
    device_address           = 0;

    do_reset;
    @(posedge clock);

    // ------------------------------------------------------------------
    // Test 1: Write transaction (happy path — slave ACKs everything)
    // ------------------------------------------------------------------
    $display("TEST 1: write 16'h1234 to reg 8'hAB on device 7'h48");
    trigger_write(7'h48, 8'hAB, 16'h1234);
    wait_done;
    if (o_busy !== 1'b0) begin
      $display("  FAIL: o_busy not deasserted after write");
      fail_count = fail_count + 1;
    end else
      $display("  PASS");
    @(posedge clock);

    // ------------------------------------------------------------------
    // Test 2: Read transaction — verify received data
    // ------------------------------------------------------------------
    $display("TEST 2: read reg 8'h10 on device 7'h48, expect 16'hBEEF");
    trigger_read(7'h48, 8'h10, 16'hBEEF);
    wait_done;
    if (o_busy !== 1'b0) begin
      $display("  FAIL: o_busy not deasserted after read");
      fail_count = fail_count + 1;
    end else if (o_miso_data !== 16'hBEEF) begin
      $display("  FAIL: miso_data=16'h%04X, expected 16'hBEEF", o_miso_data);
      fail_count = fail_count + 1;
    end else
      $display("  PASS: miso_data=16'h%04X", o_miso_data);
    @(posedge clock);

    // ------------------------------------------------------------------
    // Test 3: Slave NACKs address — master must abort back to IDLE
    // ------------------------------------------------------------------
    $display("TEST 3: slave NACKs address on write, master should return to IDLE");
    tb_nack_addr = 1;
    trigger_write(7'h48, 8'hAB, 16'hDEAD);
    wait_done;
    tb_nack_addr = 0;
    if (o_busy !== 1'b0) begin
      $display("  FAIL: o_busy not deasserted after address NACK");
      fail_count = fail_count + 1;
    end else
      $display("  PASS");
    @(posedge clock);

    // ------------------------------------------------------------------
    // Test 4: Back-to-back writes
    // ------------------------------------------------------------------
    $display("TEST 4: two consecutive writes");
    trigger_write(7'h20, 8'h01, 16'hAABB);
    wait_done;
    trigger_write(7'h20, 8'h02, 16'hCCDD);
    wait_done;
    if (o_busy !== 1'b0) begin
      $display("  FAIL: o_busy not deasserted after back-to-back writes");
      fail_count = fail_count + 1;
    end else
      $display("  PASS");

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------
    if (fail_count == 0)
      $display("ALL TESTS PASSED");
    else
      $display("%0d TEST(S) FAILED", fail_count);

    #100;
    $finish;
  end

endmodule
