# =============================================================
# 테스트용 플레이스홀더 밈 이미지 생성기 (generate-placeholders.ps1)
# 진짜 밈이 없을 때 전체 흐름을 돌려보기 위한 임시 정사각 이미지 6장을 만듭니다.
# 나중에 public/memes/meme1.jpg ~ meme6.jpg 를 진짜 파일로 덮어쓰면 됩니다.
#
# 실행 방법(다시 만들고 싶을 때):
#   powershell.exe -ExecutionPolicy Bypass -File scripts\generate-placeholders.ps1
# =============================================================

Add-Type -AssemblyName System.Drawing

# 이 스크립트(scripts 폴더) 기준으로 public/memes 경로 계산
$dir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\public\memes"))
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$size = 600 # 정사각형 (3x3 퍼즐로 나누기 좋게 600 = 200 x 3)

# 밈마다 배경 그라데이션용 두 색 (알록달록하게)
$palettes = @(
  @('#FF5E8A', '#FFC371'),
  @('#42E695', '#3BB2B8'),
  @('#7F7FD5', '#86A8E7'),
  @('#F7971E', '#FFD200'),
  @('#FC5C7D', '#6A82FB'),
  @('#11998E', '#38EF7D')
)

for ($i = 1; $i -le 6; $i++) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAlias'

  # 배경: 대각선 그라데이션
  $c1 = [System.Drawing.ColorTranslator]::FromHtml($palettes[$i - 1][0])
  $c2 = [System.Drawing.ColorTranslator]::FromHtml($palettes[$i - 1][1])
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
  $g.FillRectangle($brush, $rect)

  # 3x3 퍼즐 가이드 격자선 (조각 구분이 잘 되라고)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 255, 255), 3)
  for ($k = 1; $k -le 2; $k++) {
    $p = $size * $k / 3
    $g.DrawLine($pen, $p, 0, $p, $size)
    $g.DrawLine($pen, 0, $p, $size, $p)
  }

  # 모서리 특징 도형 (조각마다 달라 보이게)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
  $g.FillEllipse($white, 30, 30, 90, 90)
  $g.FillRectangle($white, ($size - 150), ($size - 110), 110, 70)

  # 가운데 큰 숫자 (그림자 + 흰색)
  $font = New-Object System.Drawing.Font('Arial Black', 180, [System.Drawing.FontStyle]::Bold)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 0, 0, 0))
  $g.DrawString("$i", $font, $shadow, ($size / 2) + 5, ($size / 2) + 5, $fmt)
  $g.DrawString("$i", $font, [System.Drawing.Brushes]::White, ($size / 2), ($size / 2), $fmt)

  # 하단 라벨
  $font2 = New-Object System.Drawing.Font('Arial', 26, [System.Drawing.FontStyle]::Bold)
  $g.DrawString("MEME $i (placeholder)", $font2, [System.Drawing.Brushes]::White, ($size / 2), ($size - 48), $fmt)

  $out = Join-Path $dir "meme$i.jpg"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "생성: $out"
}

Write-Host "완료! 총 6장"
