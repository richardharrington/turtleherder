<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Bobcats</title>
<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" type="text/css" href="css/main.css" />
<script type="text/javascript" src="js/main.js"></script>
</head>
<body class="oneColElsCtr">

<div id="container">
  <div id="mainContent">
    <div class="style1">


<?php

function un_escape($str) {
  if(get_magic_quotes_gpc()) {
    $str = stripslashes($str);
  }
  return($str);
}

function convert_24hour($hour, $am_or_pm) {
  if ($am_or_pm == 'am') {
    $hour_24 = $hour % 12;
  }
  // There's probably no other possibility, but
  // this will help catch errors if the function
  // doesn't return anything.
  else if ($am_or_pm == 'pm') {
    $hour_24 = ($hour % 12) + 12;
  }
  return $hour_24;
}

error_reporting(E_ALL);
ini_set('display_errors', true);

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

$red = "#CC0000";

if (isset($_REQUEST['id'])) {
  $updating_existing_game = TRUE;
  echo "<h1>Edit Game</h1>";
}
else {
  $updating_existing_game = FALSE;
  echo "<h1>Add New Game</h1>";
}

if (isset($_POST['name'])) {
  $called_by_self = TRUE;
}
else {
  $called_by_self = FALSE;
}

?>


<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>


<?php

$game_name = '';
$game_color = '';
$game_month = 'blank';
$game_day = 'blank';
$game_year = 'blank';
$game_hour = 'blank';
$game_minute = 'blank';
$game_ampm = 'blank';

$data_uploaded = FALSE;

// If $_POST['name'] exists, then this is either a fresh call
// from an "edit game" link, or a call from this very page with
// form information to process (which should already have been
// validated in Javascript).

// In this IF block, we are assigning non-empty values to all the variables,
// if they (and their associates, like hour for minute)
// have been entered and the dates are not bad.

// All the info should already have been validated by Javascript in the previous rendering
// of this page.

if ($called_by_self) {

  // name
  $game_name = un_escape($_POST['name']);

  // color
  $game_color = un_escape($_POST['color']);

  // date
  $game_month = (int)$_POST['month'];
  $game_day = (int)$_POST['day'];
  $game_year = (int)$_POST['year'];

  // time
  $game_hour = (int)$_POST['hour'];
  $game_minute = (int)$_POST['minute'];
  $game_ampm = $_POST['ampm'];

  $game_unixtimestamp = mktime (convert_24hour($game_hour, $game_ampm), $game_minute, 0,   // zero seconds
      $game_month, $game_day, $game_year);
  $escaped_game_name = $db->real_escape_string($game_name);
  $escaped_game_color = $db->real_escape_string($game_color);

  if ($updating_existing_game) {
    $id = $_POST['id'];
    $sql = "UPDATE bobcats_game SET " .
        "name = '$escaped_game_name', " .
        "color = '$escaped_game_color', " .
        "unixtimestamp = '$game_unixtimestamp' " .
        "WHERE id='$id'";
    if ($db->query($sql)) {
      echo '<p>Game updated</p>';
    }
    else {
      echo '<p>Error updating game</p>';
    }
  }
  else {
    $sql = "INSERT INTO bobcats_game SET " .
        "name = '$escaped_game_name', " .
        "color = '$escaped_game_color', " .
        "unixtimestamp = '$game_unixtimestamp'";
    if ($db->query($sql)) {
      echo '<p>Game added</p>';
    }
    else {
      echo '<p>Error adding game</p>';
    }
    $game_id = $db->insert_id;

    $sql = "INSERT INTO bobcats_attendance (game_id, player_id) " .
        "SELECT '$game_id', id FROM bobcats_player";
    if ($db->query($sql)) {
        echo '<p>Players assigned to new game.</p>';
    } else {
      echo '<p>Error assigning players to new game</p>';
    }
  }
  $data_uploaded = TRUE;

  ?>
  <p><a href="<?php echo $_SERVER['PHP_SELF']; ?>">Add another game</a></p>
  <p><a href="games.php">Return to games management page</a></p>
  <?php
}

else if ($updating_existing_game) {
  $id = $_REQUEST['id'];
  $game = $db->query("SELECT name, color, unixtimestamp FROM bobcats_game WHERE id='$id'");
  if (!$game) {
    exit('<p>Error retrieving game from database!<br />' .
        'Error</p>');
  }
  $row = $game->fetch_array();
  $game_name = $row['name'];
  $game_color = $row['color'];
  $game_month = (int)date('n', $row['unixtimestamp']);
  $game_day = (int)date('j', $row['unixtimestamp']);
  $game_year = (int)date('Y', $row['unixtimestamp']);
  $game_hour = (int)date('g', $row['unixtimestamp']);
  $game_minute = (int)date('i', $row['unixtimestamp']);
  $game_ampm = date('a', $row['unixtimestamp']);
}

if (!$data_uploaded) {

  ?>

  <form name="form1" action="<?php echo $_SERVER['PHP_SELF']; ?>" method="post">
  <p><?php if ($updating_existing_game) echo "Update game info:"; else echo "Enter new game:"; ?></p>

  <p class="hiding" id="nameError"><span class="error">Please type in a name for the opposing team.</span></p><br />

  <label>Opposing team name: <input type="text" name="name"
      value="<?php echo htmlspecialchars($game_name); ?>" /></label><br /><br />
  <label>Opposing team color (optional): <input type="text" name="color"
      value="<?php echo htmlspecialchars($game_color); ?>" /></label><br /><br />

  <p class="hiding" id="dateError"><span class="error">Please select a valid date.</span></p><br />

  <strong>Date:</strong>&nbsp;&nbsp;month
  <label><select name="month">
    <?php

    if ($game_month == 'blank') {
      echo '<option value="blank"></option><br />'; // the first blank option, the default
    }
    for ($month = 1; $month <= 12; $month++) {
      echo "<option value=\"$month\"";
      if ($month === $game_month) {   //  if $month equals the month from the database or the input
        echo " selected";
      }
      $month_for_display = date('M', mktime(0,0,0,$month));
      echo ">$month_for_display</option><br />";
    }
    ?>
  </select></label>&nbsp;&nbsp;day
  <label><select name="day">
    <?php
    if ($game_day == 'blank') {
      echo '<option value="blank"></option><br />'; // the first blank option, the default
    }
    for ($day = 1; $day <= 31; $day++) {
      echo "<option value=\"$day\"";
      if ($day === $game_day) {   //  if $day equals the day from the database or the input
        echo " selected";
      }
      echo ">$day</option><br />";
    }
    ?>
  </select></label>&nbsp;&nbsp;year
  <label><select name="year">
    <?php
    if ($game_year == 'blank') {
      echo '<option value="blank"></option><br />'; // the first blank option, the default
    }
    $current_year = date('Y', time());
    for ($year = $current_year; $year <= $current_year+2; $year++) {
      echo "<option value=\"$year\"";
      if ($year === $game_year) {   //  if $day equals the day from the database or the input
        echo " selected";
      }
      echo ">$year</option><br />";
    }
    ?>
  </select></label>
  <br />
  <br />

  <p class="hiding" id="timeError"><span class="error">Please select a time (make sure to check am or pm, too).</span></p><br />

  <strong>Time:</strong>&nbsp;&nbsp;hour
  <label><select name="hour">
    <?php

    if ($game_hour == 'blank') {
      echo '<option value="blank"></option><br />'; // the first blank option, the default
    }
    for ($hour = 1; $hour <= 12; $hour++) {
      echo "<option value=\"$hour\"";
      if ($hour === $game_hour) {   //  if $month equals the month from the database or the input
        echo " selected";
      }
      echo ">$hour</option><br />";
    }
    ?>
  </select></label>&nbsp;&nbsp;minute
  <label><select name="minute">
    <?php
    if ($game_minute == 'blank') {
      echo '<option value="blank"></option><br />'; // the first blank option, the default
    }
    for ($minute = 0; $minute <= 55; $minute = $minute + 5) {
      echo "<option value=\"$minute\"";
      if ($minute === $game_minute) {   //  if $day equals the day from the database or the input
        echo " selected";
      }
      // kludgy way of adding leading zero:
      $minute_for_display = date('i', mktime(0,$minute));
      echo ">$minute_for_display</option><br />";
    }
    ?>
  </select></label>&nbsp;
  <label><select name="ampm" size="2">
    <?php
    echo '<option value="am"';
    if ($game_ampm == 'am') {
      echo " selected";
    }
    echo ">am</option><br />";
    echo '<option value="pm"';
    if ($game_ampm == 'pm') {
      echo " selected";
    }
    echo ">pm</option><br />";
    ?>
  </select></label><br /><br />

  <?php
  if ($updating_existing_game) {
    ?>
    <label><input type="hidden" name="id" value="<?php echo $_REQUEST['id']; ?>" /></label>
    <?php
  }
  ?>

  <input type="submit" name="submit" value="SUBMIT" onClick="return validateGame(document.form1)" />



  </form>

<?php

}

?>

<br />
</div>
</div>
</div>



</body>
</html>
