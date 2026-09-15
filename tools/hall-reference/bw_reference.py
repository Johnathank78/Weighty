"""
Reference trajectories for the Hall adult dynamic body-weight model.

This is a line-by-line Python transliteration of `adult_weight.cpp` from the
`bw` R package (Dynamic Body Weight Models for Children and Adults), which
implements Chow & Hall 2008 / Hall 2010 / Hall et al. Lancet 2011:

    https://github.com/INSP-RH/bw  (src/adult_weight.cpp, version 1.0.0)
    Authors: Dalia Camacho-Garcia-Formenti, Rodrigo Zepeda-Tello
    License: MIT, Copyright 2018 Instituto Nacional de Salud Publica de Mexico

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to
    deal in the Software without restriction, including without limitation the
    rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
    sell copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions: The above copyright
    notice and this permission notice shall be included in all copies or
    substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
    WITHOUT WARRANTY OF ANY KIND.

It keeps bw's numerical scheme (sequential RK4 per state variable, dt = 1 day,
floor(t/dt) input sampling) so it is numerically independent from the coupled
RK4 used by the Wheighty TypeScript port.

Single documented extension (not present in bw): `pa_delta` adds a constant
change to the physical-activity parameter delta (kcal/kg/day) from day 0, to
produce the physical-activity-change scenarios required by
instruct/06_VALIDATION_TEST_PLAN.md section 11. With pa_delta = 0 the code is
identical to bw.

Usage:  python tools/hall-reference/bw_reference.py > tests/fixtures/hall-reference.json
"""

import json
import math

RO_G = 4206.501
NA = 3220.0
ZETA_NA = 3000.0
ZETA_CI = 4000.0
RO_F = 9440.727
RO_L = 1816.444
GAMMA_F = 3.107075
GAMMA_L = 21.98853
ETA_F = 179.2543
ETA_L = 229.4455
BETA_TEF = 0.1
BETA_AT = 0.14
TAU_AT = 14.0
C = 10.4 * (RO_L / RO_F)
ALFA1 = -(1 + ETA_L / RO_L) * C
ALFA2 = -(1 + ETA_F / RO_F)
RMR_BW = 9.99
RMR_AGE = 4.92
RMR_HT = 625.0
RMR_M = 5.0
RMR_F = 161.0
G_BASE = 0.5


class Adult:
    def __init__(self, bw, ht, age, female, ei_change, pal, pcarb_base, pcarb, pa_delta=0.0, na_change=0.0):
        self.bw = bw
        self.ht = ht
        self.age = age
        self.sex = 1.0 if female else 0.0
        self.ei_change = ei_change  # function(day_index) -> kcal
        self.na_change = na_change
        self.pal = pal
        self.pcarb = pcarb
        self.pcarb_base = pcarb_base
        self.pa_delta = pa_delta
        s = self.sex
        self.rmr = (RMR_BW * bw + RMR_HT * ht - RMR_AGE * age + RMR_M) * (1 - s) + (RMR_BW * bw + RMR_HT * ht - RMR_AGE * age - RMR_F) * s
        self.ecfinit = (0.025 * age + 9.57 * ht + 0.191 * bw - 12.4) * (1.0 - s) + (-4.0 + 5.98 * ht + 0.167 * bw) * s
        self.fat = (bw * (0.14 * age + 37.31 * math.log(bw / ht ** 2) - 103.94) / 100.0) * (1 - s) + (
            bw * (0.14 * age + 39.96 * math.log(bw / ht ** 2) - 102.01) / 100.0
        ) * s
        self.lean = bw - (self.ecfinit + self.fat + 3.7 * G_BASE)
        self.EI = self.rmr * pal
        self.delta = ((1.0 - BETA_TEF) * pal - 1.0) * self.rmr / bw
        self.K = (self.rmr * pal) - GAMMA_L * self.lean - GAMMA_F * self.fat - self.delta * bw
        self.CIb = pcarb_base * self.EI
        self.kG = self.CIb / (G_BASE ** 2)

    def deltaEI(self, t):
        return self.ei_change(int(math.floor(t)))

    def total_intake(self, t):
        return self.EI + self.deltaEI(t)

    def CI(self, t):
        return self.pcarb * self.total_intake(t)

    def TEF(self, t):
        return BETA_TEF * self.deltaEI(t)

    def dG(self, t, G):
        return (self.CI(t) - self.kG * G ** 2) / RO_G

    def dAT(self, t, AT):
        return (BETA_AT * self.deltaEI(t) - AT) * (1.0 / TAU_AT)

    def dECF(self, t, ECF):
        return (self.na_change - ZETA_NA * (ECF - self.ecfinit) - ZETA_CI * (1.0 - self.CI(t) / self.CIb)) / NA

    def fat_mass(self, L):
        return self.fat * math.exp(RO_L * (L - self.lean) / (RO_F * C))

    def R(self, t, L, G, AT, ECF):
        F = self.fat_mass(L)
        weight = L + F + ECF + 3.7 * G
        R3 = self.K + (self.delta + self.pa_delta) * weight + self.TEF(t) + AT - self.total_intake(t) + RO_G * self.dG(t, G)
        return (R3 + GAMMA_L * L + GAMMA_F * F) / (ALFA1 + ALFA2 * F)

    def dL(self, t, L, G, AT, ECF):
        return self.R(t, L, G, AT, ECF) * (C / RO_L)

    def rk4(self, days, dt=1.0):
        AT, ECF, GLY, L = 0.0, self.ecfinit, G_BASE, self.lean
        BW = [self.bw]
        t = 0.0
        for _ in range(int(math.ceil(days / dt))):
            k1 = self.dAT(t, AT)
            k2 = self.dAT(t + 0.5 * dt, AT + 0.5 * dt * k1)
            k3 = self.dAT(t + 0.5 * dt, AT + 0.5 * dt * k2)
            k4 = self.dAT(t + dt, AT + dt * k3)
            AT_new = AT + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0

            k1 = self.dECF(t, ECF)
            k2 = self.dECF(t + 0.5 * dt, ECF + 0.5 * dt * k1)
            k3 = self.dECF(t + 0.5 * dt, ECF + 0.5 * dt * k2)
            k4 = self.dECF(t + dt, ECF + dt * k3)
            ECF_new = ECF + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0

            k1 = self.dG(t, GLY)
            k2 = self.dG(t + 0.5 * dt, GLY + 0.5 * dt * k1)
            k3 = self.dG(t + 0.5 * dt, GLY + 0.5 * dt * k2)
            k4 = self.dG(t + dt, GLY + dt * k3)
            GLY_new = GLY + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0

            gm = 0.5 * (GLY_new + GLY)
            am = 0.5 * (AT_new + AT)
            em = 0.5 * (ECF_new + ECF)
            k1 = self.dL(t, L, GLY, AT, ECF)
            k2 = self.dL(t + 0.5 * dt, L + 0.5 * dt * k1, gm, am, em)
            k3 = self.dL(t + 0.5 * dt, L + 0.5 * dt * k2, gm, am, em)
            k4 = self.dL(t + dt, L + dt * k3, GLY_new, AT_new, ECF_new)
            L = L + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0

            AT, ECF, GLY = AT_new, ECF_new, GLY_new
            F = self.fat_mass(L)
            BW.append(F + L + ECF + 3.7 * GLY)
            t += dt
        return BW


SCENARIOS = [
    # id, sex, age, height_m, weight_kg, PAL, pcarb_base, pcarb, EI change kcal/day, pa_delta kcal/kg/day
    ("f25_normal_loss_calories", "female", 25, 1.65, 60.0, 1.6, 0.5, 0.5, -400.0, 0.0),
    ("m28_normal_gain_calories", "male", 28, 1.80, 72.0, 1.7, 0.5, 0.5, 350.0, 0.0),
    ("f42_obese_loss_calories", "female", 42, 1.62, 92.0, 1.5, 0.5, 0.45, -600.0, 0.0),
    ("m45_obese_loss_calories", "male", 45, 1.76, 110.0, 1.6, 0.5, 0.5, -800.0, 0.0),
    ("f38_overweight_loss_activity", "female", 38, 1.68, 76.0, 1.5, 0.5, 0.5, 0.0, 4.0),
    ("m40_overweight_loss_activity_and_calories", "male", 40, 1.78, 88.0, 1.55, 0.5, 0.5, -300.0, 3.0),
    ("f62_normal_loss_calories", "female", 62, 1.60, 63.0, 1.5, 0.5, 0.5, -350.0, 0.0),
    ("m63_overweight_loss_calories", "male", 63, 1.74, 84.0, 1.55, 0.5, 0.5, -500.0, 0.0),
    ("f64_obese_gain_calories", "female", 64, 1.58, 85.0, 1.45, 0.5, 0.5, 250.0, 0.0),
    ("m24_normal_gain_activity_drop", "male", 24, 1.83, 75.0, 1.8, 0.5, 0.5, 0.0, -3.0),
    ("f30_overweight_gain_calories", "female", 30, 1.70, 80.0, 1.6, 0.5, 0.55, 300.0, 0.0),
    ("m50_obese_loss_lowcarb", "male", 50, 1.72, 115.0, 1.5, 0.5, 0.3, -700.0, 0.0),
    ("f47_normal_maintenance_activity_up", "female", 47, 1.64, 58.0, 1.6, 0.5, 0.5, 200.0, 3.5),
    ("m33_obese_gain_calories", "male", 33, 1.85, 108.0, 1.65, 0.5, 0.5, 500.0, 0.0),
]

HORIZON = 365


def main():
    out = {
        "generator": "tools/hall-reference/bw_reference.py (transliteration of INSP-RH/bw adult_weight.cpp v1.0.0, MIT)",
        "horizonDays": HORIZON,
        "scenarios": [],
    }
    for sid, sex, age, ht, bw, pal, pcb, pc, dei, pad in SCENARIOS:
        a = Adult(bw, ht, age, sex == "female", lambda d, dei=dei: dei, pal, pcb, pc, pa_delta=pad)
        traj = a.rk4(HORIZON)
        out["scenarios"].append(
            {
                "id": sid,
                "sex": sex,
                "ageYears": age,
                "heightM": ht,
                "bodyWeightKg": bw,
                "pal": pal,
                "baselineCarbFraction": pcb,
                "carbFraction": pc,
                "intakeChangeKcal": dei,
                "paDeltaKcalPerKgDay": pad,
                "baselineRmrKcal": a.rmr,
                "baselineIntakeKcal": a.EI,
                "weightKgByDay": {str(d): traj[d] for d in (0, 7, 14, 30, 60, 90, 120, 180, 270, 365)},
            }
        )
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
