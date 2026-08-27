"""上传图片裁剪与压缩。"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.exceptions import AppException

# 通用图：最长边；头像：正方形边长
DEFAULT_MAX_EDGE = 1920
AVATAR_SIZE = 512
JPEG_QUALITY = 85
WEBP_QUALITY = 82


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    content_type: str
    extension: str


def _open_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise AppException(
            code=400015,
            message="无法识别的图片文件",
            status_code=400,
        ) from exc
    except OSError as exc:
        raise AppException(
            code=400015,
            message="图片损坏或无法读取",
            status_code=400,
        ) from exc
    return ImageOps.exif_transpose(image)


def _to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"RGB", "L"}:
        return image.convert("RGB")
    if image.mode in {"RGBA", "LA", "P"}:
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        return background
    return image.convert("RGB")


def _encode_jpeg(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(
        buffer,
        format="JPEG",
        quality=JPEG_QUALITY,
        optimize=True,
        progressive=True,
    )
    return buffer.getvalue()


def _encode_webp(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
    return buffer.getvalue()


def process_upload_image(
    data: bytes,
    *,
    purpose: str = "default",
) -> ProcessedImage:
    """裁剪/缩放并压缩图片。

    - avatar：居中裁剪为正方形后缩至 512×512，输出 JPEG
    - default：最长边不超过 1920，优先 WebP（更小）否则 JPEG
    动图 GIF 仅取首帧处理（避免体积失控）。
    """
    image = _open_image(data)
    rgb = _to_rgb(image)

    if purpose == "avatar":
        squared = ImageOps.fit(
            rgb,
            (AVATAR_SIZE, AVATAR_SIZE),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        return ProcessedImage(
            data=_encode_jpeg(squared),
            content_type="image/jpeg",
            extension=".jpg",
        )

    max_edge = max(rgb.size)
    if max_edge > DEFAULT_MAX_EDGE:
        rgb.thumbnail((DEFAULT_MAX_EDGE, DEFAULT_MAX_EDGE), Image.Resampling.LANCZOS)

    webp = _encode_webp(rgb)
    jpeg = _encode_jpeg(rgb)
    if len(webp) <= len(jpeg):
        return ProcessedImage(
            data=webp,
            content_type="image/webp",
            extension=".webp",
        )
    return ProcessedImage(
        data=jpeg,
        content_type="image/jpeg",
        extension=".jpg",
    )
