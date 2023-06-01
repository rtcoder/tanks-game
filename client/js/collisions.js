function isPointInWater(points) {
  for (const waterField of WATER_FIELDS) {
    for (const point of points) {
      if (ctx.isPointInPath(waterField.getPath(), point.x, point.y)) {
        return true;
      }
    }
  }
  return false;
}

function detectTankMineCollision() {
  MINES.filter(isMineArmored)
      .forEach((mine, i) => {
        const collidingWithTank = circleRectColliding(mine, userTank);
        const collidingWithAnyCornerPoint = getRectangleCornerPointsAfterRotate(userTank)
            .some(point => circleRectColliding(mine, point));
        if (collidingWithTank || collidingWithAnyCornerPoint) {
          userTank.lives -= 10;
          MINES.splice(i, 1);
          sendMessage({type: 'UPDATE_TANK', payload: {tank: userTank}});
          sendMessage({type: 'UPDATE_MINES', payload: {mines: MINES}});
        }
      });
}

function circleRectColliding(circle, rect) {
  const {width = 1, height = 1} = rect;
  const distX = Math.abs(circle.x - rect.x - width / 2);
  const distY = Math.abs(circle.y - rect.y - height / 2);

  if (distX > (width / 2 + circle.size)) {
    return false;
  }
  if (distY > (height / 2 + circle.size)) {
    return false;
  }

  if (distX <= (width / 2)) {
    return true;
  }
  if (distY <= (height / 2)) {
    return true;
  }

  const dx = distX - width / 2;
  const dy = distY - height / 2;
  return (dx * dx + dy * dy <= (circle.size * circle.size));
}
