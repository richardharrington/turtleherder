<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Bobcats</title>
<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" type="text/css" href="css/main.css" />
</head>
<body class="oneColElsCtr">

<div id="container">
  <div id="mainContent">
    <div class="style1">
    <h1>Change Attendance Status</h1>

<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>



<?php


error_reporting(E_ALL);
ini_set('display_errors', true);



// main block

$db = new mysqli(
  'mysql50-36.wc1.dfw1.stabletransit.com',
  '496492_th',
  '*password*',
  '496492_turtlemaster'
);
if (!$db) {
  exit('<p>Unable to connect to the ' .
      'database server at this time.</p>');
}


$attendance_id = $_GET['id'];

$sql = "SELECT player_id, game_id FROM bobcats_attendance " .
       "WHERE id = '$attendance_id'";
if (!$result=$db->query($sql)) {
  echo '<p>Error accessing game database in main block part one</p>';
}
$row = $result->fetch_array();   // only one row
$player_id = $row['player_id'];
$game_id = $row['game_id'];


$sql = "SELECT bobcats_player.name AS player_name, bobcats_game.name AS game_name, " .
        "bobcats_game.unixtimestamp, bobcats_attendance.status " .
       "FROM bobcats_player, bobcats_game, bobcats_attendance " .
       "WHERE bobcats_player.id = '$player_id' " .
       "AND bobcats_game.id = '$game_id' AND bobcats_attendance.id = '$attendance_id'";

if (!$result=$db->query($sql)) {
    echo '<p>Error accessing game database in main block part two</p>';
}
$row = $result->fetch_array();  // only one row
$player_name = htmlspecialchars($row['player_name']);
$game_date = date('l, F j, Y', $row['unixtimestamp']);    // e.g. Friday, January 27, 2010
$game_time = date('g:i a', $row['unixtimestamp']);  // e.g. 8:35 pm
$game_name = htmlspecialchars($row['game_name']);
$attendance_status = $row['status'];

// the following form will have already checked
// whatever radio button reflects the current status.

?>

<form action="index.php" method="get">
<?php echo "<p>$player_name, will " .
      "you be coming to the game on " .
      "$game_date against $game_name at $game_time?</p>"; ?>

<input type="hidden" name="attendance_id" value="<?php echo $attendance_id; ?>">
<input type="hidden" name="has_changed" value="1">
<input name="" type="text" value="" style="display:none">
<label><input type="radio" name="attendance_status" value="yes"
       <?php if ($attendance_status == 'yes') echo ' checked'; ?>>Yes<br /></label>
<label><input type="radio" name="attendance_status" value="no"
       <?php if ($attendance_status == 'no') echo ' checked'; ?>>No<br /></label>
<label><input type="radio" name="attendance_status" value="not_sure"
       <?php if ($attendance_status == 'not_sure') echo ' checked'; ?>>I'm not sure<br /></label>
                <!-- Meaning, if they've previously indicate uncertainty, the default is "not_sure," -->
                <!-- but if they haven't responded yet, it's "no_response," and no radio button is checked.  -->
<br />
<input type="submit" value="SUBMIT" />
</form>
<br />


</div>
</div>
</div>
</body>
</html>