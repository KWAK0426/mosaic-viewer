"""Prepare a georeferenced RGB mosaic for range-based browser viewing.

python tools/prepare.py input.tif output.cog.tif --title "관측 이름" \
    --date 2026-10-15 --id observation-01 --white-background
"""
import argparse
import json
from pathlib import Path
import tempfile

import numpy as np
from PIL import Image
import rasterio
from rasterio.enums import Resampling
from rasterio.shutil import copy
from rasterio.warp import transform_bounds

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('input',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--title',required=True);p.add_argument('--date',required=True)
    p.add_argument('--id',required=True);p.add_argument('--quality',type=int,default=92)
    p.add_argument('--white-background',action='store_true',help='Only for RGB imagery whose unmarked background is pure white.')
    args=p.parse_args()
    if args.input.resolve()==args.output.resolve():p.error('Input and output must be different files.')
    if args.output.exists():p.error('Output exists; choose a new output path.')
    if not 1<=args.quality<=100:p.error('Quality must be 1..100.')
    with rasterio.open(args.input) as src:
        if not src.crs:p.error('No CRS in source. Supply georeferencing before conversion.')
        if src.count not in (3,4) or src.dtypes[0]!='uint8':p.error('This tool accepts 8-bit RGB/RGBA imagery only; do not use JPEG compression on scientific scalar data.')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        bounds=transform_bounds(src.crs,'EPSG:4326',*src.bounds,densify_pts=21)
        metadata={'id':args.id,'title':args.title,'date':args.date,'type':'RGB 모자이크',
          'driveFileId':'REPLACE_WITH_UPLOADED_FILE_ID','width':src.width,'height':src.height,
          'bounds':list(bounds),'whiteNodata':False,'thumbnail':args.id+'.webp'}
        with tempfile.TemporaryDirectory(prefix='mosaic-') as temp:
            masked=Path(temp)/'masked.tif';profile=src.profile.copy()
            # Explicit mask preserves the source alpha and marks only pure-white
            # background when the operator has opted into that interpretation.
            profile.update(count=3,compress='deflate',tiled=True,blockxsize=512,blockysize=512)
            with rasterio.Env(GDAL_TIFF_INTERNAL_MASK=True):
                with rasterio.open(masked,'w',**profile) as dst:
                    for _,window in src.block_windows(1):
                        rgb=src.read([1,2,3],window=window);dst.write(rgb,window=window)
                        mask=src.dataset_mask(window=window)
                        if args.white_background:mask[np.all(rgb==255,axis=0)]=0
                        dst.write_mask(mask,window=window)
            copy(masked,args.output,driver='COG',COMPRESS='JPEG',QUALITY=args.quality,
                 BLOCKSIZE=512,OVERVIEWS='IGNORE_EXISTING',OVERVIEW_RESAMPLING='AVERAGE',NUM_THREADS='ALL_CPUS',BIGTIFF='IF_SAFER')
        height=max(1,round(640*src.height/src.width))
        pixels=src.read([1,2,3],out_shape=(3,height,640),resampling=Resampling.average)
        thumb=Image.fromarray(np.moveaxis(pixels,0,-1))
        thumb.save(args.output.parent/metadata['thumbnail'],quality=85)
    metadata['sizeBytes']=args.output.stat().st_size
    with rasterio.open(args.output) as result:
        assert result.tags(ns='IMAGE_STRUCTURE').get('LAYOUT')=='COG'
        assert result.width==metadata['width'] and result.height==metadata['height']
    args.output.with_suffix('.entry.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
