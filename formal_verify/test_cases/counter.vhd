library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter is
    port (
        clk   : in STD_LOGIC;
        reset : in STD_LOGIC
    );
end entity;

architecture rtl of counter is
    signal timer_us   : UNSIGNED(25 downto 0) := (others => '0');
    signal timer_tick : STD_LOGIC;
begin
    process(clk)
    begin
        if rising_edge(clk) then
            if (reset = '1') then
                timer_us <= (others => '0');
            else
                timer_us <= timer_us + 1;
            end if;
        end if;
    end process;
end architecture;
