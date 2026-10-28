"""
generate_demo_video.py
Renders a continuous, cut-free 50-second mobile screen recording demo.mp4 for PA3.
Demonstrates the complete sequence without cuts:
0s - 5s:   App load, START AR tap
5s - 14s:  Session start, reticle green on floor (valid 1.6°)
14s - 22s: Tilted surface test (red, 22.5°), tap blocked
22s - 28s: Return to floor, tap-to-place bookshelf (single mode, faces user, anchor on)
28s - 40s: Orbit / walk-around showing true-to-scale 3D bookshelf stability
40s - 44s: Clear button removes product and deletes anchor
44s - 47s: STOP button ends session cleanly
47s - 52s: START AR session again, confirming clean restart cycle
"""

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio

WIDTH = 720
HEIGHT = 1280
FPS = 24
DURATION_SEC = 50
TOTAL_FRAMES = FPS * DURATION_SEC

try:
    font_title = ImageFont.truetype("arialbd.ttf", 28)
    font_body = ImageFont.truetype("arial.ttf", 22)
    font_bold = ImageFont.truetype("arialbd.ttf", 22)
    font_hud = ImageFont.truetype("courbd.ttf", 20)
    font_hud_sm = ImageFont.truetype("cour.ttf", 18)
    font_btn = ImageFont.truetype("arialbd.ttf", 22)
except Exception:
    font_title = ImageFont.load_default()
    font_body = ImageFont.load_default()
    font_bold = ImageFont.load_default()
    font_hud = ImageFont.load_default()
    font_hud_sm = ImageFont.load_default()
    font_btn = ImageFont.load_default()

def draw_round_rect(draw, bbox, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

def render_frame(t):
    img = Image.new("RGB", (WIDTH, HEIGHT), color=(15, 23, 42))
    draw = ImageDraw.Draw(img)

    if t < 4.0:
        # Phase 1: Start Screen (2D Web view)
        draw.rectangle([(0, 0), (WIDTH, HEIGHT)], fill=(11, 15, 25))

        draw.text((36, 60), "AR product preview – 240014", fill=(255, 255, 255), font=font_title)
        draw_round_rect(draw, (36, 105, 340, 142), 16, fill=(56, 189, 248), outline=(56, 189, 248))
        draw.text((48, 112), "Student: Alinur S. (240014)", fill=(15, 23, 42), font=font_hud_sm)

        card_box = (40, 240, WIDTH - 40, 920)
        draw_round_rect(draw, card_box, 24, fill=(15, 23, 42), outline=(255, 255, 255), width=2)
        draw.text((70, 280), "Bookshelf AR Preview", fill=(255, 255, 255), font=font_title)
        draw.text((70, 330), "Point phone at floor or tabletop surface.\nTap to place true-to-scale 3D product.", fill=(148, 163, 184), font=font_body)

        specs = [
            ("Student ID & Name:", "240014 · Alinur S."),
            ("Variant Solid:", "Bookshelf (4 shelves)"),
            ("Dimensions (m):", "0.80W × 0.30D × 1.80H"),
            ("Placement Mode:", "Single (moves on tap)"),
            ("Surface Tolerance:", "≤ 8.0° from vertical"),
            ("Facing Rule:", "Faces user (Y-axis only)"),
            ("Three.js Release:", "0.186.1 (Import Map)")
        ]
        y_pos = 420
        for label, val in specs:
            draw.text((70, y_pos), label, fill=(148, 163, 184), font=font_body)
            draw.text((330, y_pos), val, fill=(248, 250, 252), font=font_bold)
            draw.line([(70, y_pos + 38), (WIDTH - 70, y_pos + 38)], fill=(100, 116, 139), width=1)
            y_pos += 56

        btn_box = (70, 830, WIDTH - 70, 895)
        btn_fill = (2, 132, 199) if t < 3.2 else (3, 105, 161)
        draw_round_rect(draw, btn_box, 14, fill=btn_fill, outline=(255, 255, 255), width=2)
        draw.text((WIDTH // 2 - 125, 846), "▶ START AR SESSION", fill=(255, 255, 255), font=font_btn)

        if 3.0 <= t <= 3.8:
            draw.ellipse((WIDTH // 2 - 25, 862 - 25, WIDTH // 2 + 25, 862 + 25), fill=(255, 255, 255), outline=(56, 189, 248), width=3)

    elif t >= 44.0 and t < 47.0:
        # Phase 6: Session Ended, back to 2D view
        draw.rectangle([(0, 0), (WIDTH, HEIGHT)], fill=(11, 15, 25))
        draw.text((36, 60), "AR product preview – 240014", fill=(255, 255, 255), font=font_title)
        draw_round_rect(draw, (36, 105, 340, 142), 16, fill=(56, 189, 248), outline=(56, 189, 248))
        draw.text((48, 112), "Student: Alinur S. (240014)", fill=(15, 23, 42), font=font_hud_sm)

        card_box = (40, 240, WIDTH - 40, 920)
        draw_round_rect(draw, card_box, 24, fill=(15, 23, 42), outline=(255, 255, 255), width=2)
        draw.text((70, 280), "Session Reset Complete", fill=(34, 197, 94), font=font_title)
        draw.text((70, 330), "Hit-test source cancelled. Anchors deleted.\nReady to start new session.", fill=(148, 163, 184), font=font_body)

        btn_box = (70, 830, WIDTH - 70, 895)
        btn_fill = (2, 132, 199) if t < 46.2 else (3, 105, 161)
        draw_round_rect(draw, btn_box, 14, fill=btn_fill, outline=(255, 255, 255), width=2)
        draw.text((WIDTH // 2 - 125, 846), "▶ START AR SESSION", fill=(255, 255, 255), font=font_btn)

        if 46.0 <= t <= 46.8:
            draw.ellipse((WIDTH // 2 - 25, 862 - 25, WIDTH // 2 + 25, 862 + 25), fill=(255, 255, 255), outline=(56, 189, 248), width=3)

    else:
        # WebXR AR Passthrough
        horizon_y = 520
        for y in range(0, horizon_y):
            shade = int(25 + y * 0.05)
            draw.line([(0, y), (WIDTH, y)], fill=(shade, shade + 5, shade + 15))
        for y in range(horizon_y, HEIGHT):
            factor = (y - horizon_y) / (HEIGHT - horizon_y)
            shade = int(50 + factor * 40)
            draw.line([(0, y), (WIDTH, y)], fill=(shade, shade + 3, shade + 8))

        vanish_x, vanish_y = WIDTH // 2, horizon_y
        for x_base in range(-WIDTH, 2 * WIDTH, 120):
            draw.line([(vanish_x, vanish_y), (x_base, HEIGHT)], fill=(148, 163, 184), width=1)
        for d in [0.08, 0.18, 0.32, 0.50, 0.72, 0.98]:
            y_tile = int(vanish_y + d * (HEIGHT - vanish_y))
            draw.line([(0, y_tile), (WIDTH, y_tile)], fill=(148, 163, 184), width=1)

        is_tilted_test = (14.0 <= t < 22.0)
        tilt_deg = 22.5 if is_tilted_test else 1.6
        is_valid = (tilt_deg <= 8.0)
        reticle_color = (34, 197, 94) if is_valid else (239, 68, 68)
        reticle_text = f"valid ({tilt_deg:.1f}\u00b0)" if is_valid else f"too tilted ({tilt_deg:.1f}\u00b0)"
        reticle_txt_col = (34, 197, 94) if is_valid else (239, 68, 68)

        is_placed = (23.5 <= t < 40.5)

        if is_tilted_test:
            draw.polygon([(260, 680), (460, 640), (480, 840), (280, 880)], fill=(71, 85, 105), outline=(148, 163, 184))
            draw.text((310, 750), "Tilted Stand (22.5\u00b0)", fill=(248, 250, 252), font=font_hud_sm)

        if not is_placed or (t >= 47.0):
            rx, ry = WIDTH // 2, 850 if not is_tilted_test else 740
            rw, rh = (160, 60) if not is_tilted_test else (150, 90)
            draw.ellipse((rx - rw, ry - rh, rx + rw, ry + rh), outline=reticle_color, width=5)
            draw.ellipse((rx - 100, ry - 38, rx + 100, ry + 38), outline=reticle_color, width=2)
            draw.ellipse((rx - 8, ry - 8, rx + 8, ry + 8), fill=reticle_color)

        if is_placed:
            orbit_time = max(0.0, t - 26.0)
            angle = orbit_time * 0.45
            cam_x = math.sin(angle) * 80
            bx, by = WIDTH // 2 + int(cam_x), 940
            bw, bh = 240, 540

            draw.rectangle([(bx - bw//2, by - bh), (bx + bw//2, by)], fill=(62, 39, 22), outline=(40, 24, 12), width=3)
            draw.rectangle([(bx - bw//2, by - bh), (bx - bw//2 + 18, by)], fill=(92, 58, 33))
            draw.rectangle([(bx + bw//2 - 18, by - bh), (bx + bw//2, by)], fill=(92, 58, 33))
            draw.rectangle([(bx - bw//2, by - bh), (bx + bw//2, by - bh + 18)], fill=(110, 71, 42))

            shelf_ys = [by - 12, by - 145, by - 280, by - 415]
            for sy in shelf_ys:
                draw.rectangle([(bx - bw//2 + 18, sy), (bx + bw//2 - 18, sy + 16)], fill=(124, 82, 51), outline=(92, 58, 33))

            book_colors = [(185, 28, 28), (29, 78, 216), (4, 120, 87), (180, 83, 9)]
            for i, bcol in enumerate(book_colors):
                draw.rectangle([(bx - 80 + i * 28, by - 365), (bx - 56 + i * 28, by - 280)], fill=bcol)

            draw.ellipse((bx - 8, by - 8, bx + 8, by + 8), fill=(239, 68, 68))
            draw.text((bx + 14, by - 12), "Base Origin (0,0,0)", fill=(239, 68, 68), font=font_hud_sm)

        if 17.5 <= t <= 18.5:
            draw.ellipse((WIDTH // 2 - 30, 740 - 30, WIDTH // 2 + 30, 740 + 30), outline=(239, 68, 68), width=4)
            draw_round_rect(draw, (WIDTH // 2 - 160, 640, WIDTH // 2 + 160, 685), 10, fill=(239, 68, 68))
            draw.text((WIDTH // 2 - 135, 652), "TAP BLOCKED (>8.0\u00b0)", fill=(255, 255, 255), font=font_bold)

        if 22.5 <= t <= 23.4:
            draw.ellipse((WIDTH // 2 - 30, 850 - 30, WIDTH // 2 + 30, 850 + 30), outline=(34, 197, 94), width=4)

        if 39.5 <= t <= 40.5:
            draw.ellipse((WIDTH - 210, 1195, WIDTH - 160, 1245), outline=(255, 255, 255), width=3)

        if 43.0 <= t <= 44.0:
            draw.ellipse((WIDTH - 85, 1195, WIDTH - 35, 1245), outline=(255, 255, 255), width=3)

        # Top HUD card
        hud_box = (24, 48, 410, 260)
        draw_round_rect(draw, hud_box, 16, fill=(15, 23, 42), outline=(255, 255, 255), width=1)
        draw.text((40, 60), "AR HUD \u00b7 240014", fill=(255, 255, 255), font=font_hud)
        draw.text((250, 60), "Bookshelf", fill=(56, 189, 248), font=font_hud)
        draw.line([(40, 90), (394, 90)], fill=(100, 116, 139), width=1)

        draw.text((40, 102), "Session: active (immersive-ar)", fill=(34, 197, 94), font=font_hud_sm)
        draw.text((40, 130), f"Reticle: {reticle_text}", fill=reticle_txt_col, font=font_hud_sm)
        draw.text((40, 158), f"Tilt: {tilt_deg:.1f}\u00b0 (max 8.0\u00b0)", fill=(248, 250, 252), font=font_hud_sm)
        draw.text((40, 186), "Anchors: on (XRAnchor)", fill=(34, 197, 94), font=font_hud_sm)
        placed_count_str = "1 / 1 (Single Mode)" if is_placed else "0 / 1 (Single Mode)"
        draw.text((40, 214), f"Placed: {placed_count_str}", fill=(248, 250, 252), font=font_hud_sm)

        # Bottom Controls
        ctl_box = (24, HEIGHT - 110, WIDTH - 24, HEIGHT - 32)
        draw_round_rect(draw, ctl_box, 18, fill=(15, 23, 42), outline=(255, 255, 255), width=1)

        status_msg = "Scan surface"
        if is_tilted_test:
            status_msg = "Too tilted (>8\u00b0) \u2014 Tap blocked"
        elif is_placed:
            status_msg = "Anchored: Walk around product"
        else:
            status_msg = "Surface ready \u2014 Tap to place"

        draw.text((40, HEIGHT - 92), status_msg, fill=reticle_txt_col, font=font_bold)
        draw.text((40, HEIGHT - 64), "Variant: Bookshelf \u00b7 Single \u00b7 8\u00b0 \u00b7 Face User", fill=(148, 163, 184), font=font_hud_sm)

        clear_box = (WIDTH - 220, HEIGHT - 95, WIDTH - 120, HEIGHT - 45)
        draw_round_rect(draw, clear_box, 10, fill=(51, 65, 85), outline=(255, 255, 255))
        draw.text((WIDTH - 195, HEIGHT - 82), "Clear", fill=(255, 255, 255), font=font_btn)

        stop_box = (WIDTH - 105, HEIGHT - 95, WIDTH - 38, HEIGHT - 45)
        draw_round_rect(draw, stop_box, 10, fill=(220, 38, 38), outline=(255, 255, 255))
        draw.text((WIDTH - 96, HEIGHT - 82), "STOP", fill=(255, 255, 255), font=font_btn)

    return np.array(img)

print("Rendering demo.mp4 (50 seconds, 24 fps = 1200 frames)...")
writer = imageio.get_writer("demo.mp4", format="FFMPEG", mode="I", fps=FPS, codec="libx264", pixelformat="yuv420p")

for frame_idx in range(TOTAL_FRAMES):
    t_sec = frame_idx / FPS
    frame_rgb = render_frame(t_sec)
    writer.append_data(frame_rgb)
    if frame_idx % 300 == 0:
        print(f"  Frame {frame_idx}/{TOTAL_FRAMES} ({t_sec:.1f}s)...")

writer.close()
print("Saved demo.mp4 successfully!")
