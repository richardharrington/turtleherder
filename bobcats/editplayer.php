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

// the value "id" will only exist if this page has been
// called from the "edit player" link of players.php,
// not the "add player link."

// The value "name" will only exist if this page is
// being called from itself, meaning the form has been
// validated and is ready to be processed.


if (isset($_REQUEST['id'])) {
  $updating_existing_player = TRUE;
  echo "<h1>Edit Player</h1>";
}
else {
  $updating_existing_player = FALSE;
  echo "<h1>Add New Player</h1>";
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


$data_uploaded = false;
$name = '';
$gender = '';

if ($called_by_self) {

  $name = $_POST['name'];
  $gender = $_POST['gender'];

  // Check if this has been a call from the "edit player" link
  if ($updating_existing_player) {
    $id = $_POST['id'];
    $sql = "UPDATE bobcats_player SET " .
        "name = '$name', " .
        "gender = '$gender' " .
        "WHERE id='$id'";
    if ($db->query($sql)) {
      echo '<p>Player updated</p>';
    }
    else {
      echo '<p>Error updating player</p>';
    }
  }

  // Otherwise it's a call from the "new player" link
  else {
    $sql = "INSERT INTO bobcats_player SET " .
        "name = '$name', " .
        "gender = '$gender'";
    if ($db->query($sql)) {
      echo '<p>Player added</p>';
    }
    else {
      echo '<p>Error adding player</p>';
    }
    $player_id = mysql_insert_id();

    $sql = "INSERT INTO bobcats_attendance (player_id, game_id) " .
        "SELECT '$player_id', id FROM bobcats_game";
    if ($db->query($sql)) {
        echo '<p>Attendance status for player set up for each game</p>';
    } else {
      echo '<p>Error setting up attendance status</p>';
    }
  }
  $data_uploaded = TRUE;
  ?>
  <p><a href="<?php echo $_SERVER['PHP_SELF']; ?>">Add another player</a></p>
  <p><a href="players.php">Return to roster management page</a></p>

  <?php
}


// Allow the user to enter a new player, or edit the player
else if ($updating_existing_player) {
  $id = $_REQUEST['id'];
  $player = $db->query("SELECT name, gender FROM bobcats_player WHERE id='$id'");
  if (!$player) {
    exit('<p>Error retrieving player from database!<br />' .
        'Error</p>');
  }
  $row = $db->fetch_array($player);
  $name = htmlspecialchars($row['name']);
  $gender = $row['gender'];
}

if (!$data_uploaded) {
  // The default is that this is the first call from a "new player" link,
  // and there have been no mistakes entered already.
  ?>

  <form name="form1" action="<?php echo $_SERVER['PHP_SELF']; ?>" method="post">
  <p><?php if ($updating_existing_player) echo "Update player info:"; else echo "Enter new player:"; ?></p>

  <p class="hiding" id="nameError"><span class="error">Please type in a name.</span></p><br />

  <label>Name: <input type="text" name="name" value="<?php echo $name; ?>" /></label><br /><br />

  <p class="hiding" id="genderError"><span class="error">Please select a gender.</span></p><br />

  <label><input type="radio" name="gender" value="f" <?php if ($gender == 'f') echo "checked"; ?> />female</label><br />
  <label><input type="radio" name="gender" value="m" <?php if ($gender == 'm') echo "checked"; ?> />male</label>
  <?php
  if ($updating_existing_player) {
    ?> <label><input type="hidden" name="id" value="<?php echo $_REQUEST['id']; ?>" /></label>
    <?php
  } ?>

  <br /><br />
  <input type="submit" name="submit" value="SUBMIT" onClick="return validatePlayer()" />
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
