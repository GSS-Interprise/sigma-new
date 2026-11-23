' Mantem a VPN Sophos da Marieta viva: o servidor manda "inactive 900 7680" (derruba o tunel com menos de 7.680 bytes
' em 15 min). Com o PACS parado na tela nao passa trafego e a VPN cai (queda de 23/11 10:21). 4 pings de 1.200 bytes
' ao servidor do PACS (192.168.0.90) a cada 5 min = ~10 KB por rodada. Janela oculta (0): nao atrapalha quem usa o PC.
CreateObject("WScript.Shell").Run "ping -n 4 -l 1200 192.168.0.90", 0, False
