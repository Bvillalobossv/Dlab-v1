# SenseWell · Medidor de Ruido (Web)

Web app simple que activa el **micrófono** del dispositivo, estima el nivel de sonido en **dB (aprox.)** y lo **clasifica** según una escala editable.

> ⚠️ Importante: Los navegadores entregan audio en **dBFS** (relativo al máximo digital). Para acercarte a **dB SPL** reales, ajusta la **calibración (dB)** usando una referencia conocida (por ejemplo, una app SPL calibrada o un medidor físico).

## Demo local
1. Clona el repo:
   ```bash
   git clone https://github.com/<tu-usuario>/sensewell-sound-meter.git
   cd sensewell-sound-meter
