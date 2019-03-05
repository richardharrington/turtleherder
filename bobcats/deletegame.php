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
    <h1>Delete Game</h1>

<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>

<?php



error_reporting(E_ALL);
ini_set('display_errors', true);



$dbcnx = @mysql_connect('mysql50-36.wc1.dfw1.stabletransit.com', '496492_th', 'Krul6666');
if (!$dbcnx) {
  exit('<p>Unable to connect to the ' .
      'database server at this time.</p>');
}
 // Select the badgers database
if (!@mysql_select_db('496492_turtlemaster')) {
  exit('<p>Unable to locate the master ' .
      'database at this time.</p>');
}


// this id value will either have been passed by games.php
// or by a previous calling of deletegame.php
$id = $_GET['id'];



if (isset($_GET['confirm_delete'])) {

	//  Delete all attendance statuses relating to the game
	//  along with the game itself.
	$ok1 = @mysql_query("DELETE FROM bobcats_attendance WHERE game_id='$id'");
	$ok2 = @mysql_query("DELETE FROM bobcats_game WHERE id='$id'");


	if ($ok1 AND $ok2) {
		echo '<p>Game deleted successfully!</p>';
	} else {
		echo '<p>Error deleting game from database!<br />' .
  			'Error: ' . mysql_error() . '</p>';
	}

	echo '<p><a href="games.php">Return to games management page</a></p>';
}

else {
	$sql = "SELECT name, unixtimestamp FROM bobcats_game WHERE id='$id'";

	if (!$result=@mysql_query($sql)) {
   		echo '<p>Error accessing database: ' .
        	 mysql_error() . '</p>';
	}
	$row = mysql_fetch_array($result);  // only one row
	$game_name = htmlspecialchars($row['name']);
	$game_date = date('l, F j', $row['unixtimestamp']);   //  e.g. Friday, January 27
	$game_time = date('g:i a', $row['unixtimestamp']);   //  e.g. 8:45 pm

	?>


	<form action="<?php echo $_SERVER['PHP_SELF']; ?>" method="get">
	<p>Do you really want to delete the game against
	<?php echo "<strong>$game_name</strong> on $game_date at $game_time?</p>";  ?>

	<input type="hidden" name="id" value="<?php echo $id; ?>" />
	<input type="submit" name="confirm_delete" value="YES" />
	<br />
	</form>

	<form action="games.php" method="get">
	<input type="submit" value="NO" />
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