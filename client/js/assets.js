const loadAssets = (function () {
  const ASSETS_LOCATION = 'assets';
  const IMAGES_LOCATION = ASSETS_LOCATION + '/img';
  const imagesNames = [
    'block1.png',
    'block2.png',
    'water.png',
    'mud.png',
  ];
  const IMAGES = {
    BLOCK_1: new Image(),
    BLOCK_2: new Image(),
    WATER: new Image(),
    MUD: new Image(),
  };
  const AUDIO = {
    BACKGROUND: new Audio(),
  };
  const imagesToLoad = Object.keys(IMAGES).length;
  // + Object.keys(AUDIO).length;
  let loaded = 0;

  return function () {
    return new Promise(function (resolve, reject) {

      const loadFn = () => {
        loaded++;
        console.log({loaded});
        if (loaded >= imagesToLoad) {
          console.log('loaded');
          resolve({images:IMAGES});

        }
      };

      Object.keys(IMAGES).forEach((imgKey, index) => {
        console.log({index, imgKey, imagesToLoad});
        IMAGES[imgKey].src = IMAGES_LOCATION + '/' + (imagesNames[index] || 'xx');
        IMAGES[imgKey].onload = loadFn;
      });

    });
  };

})();
